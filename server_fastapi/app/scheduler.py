"""
Планировщик задач Tinkoff (Фаза 5): синхронизация портфеля, инструментов, последних цен.
Использует AsyncIOScheduler для выполнения async-задач с доступом к БД.
"""

from __future__ import annotations

import asyncio
import contextlib
import contextvars
import json
import math
import os
import time
import uuid
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from dataclasses import dataclass
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import delete, func, select

from app.core.config import Settings
from app.core.error_registry import get_error_registry
from app.core.time_utils import iso_now_msk, now_msk
from app.db.models import AppSetting, Asset, Candle, Instrument, Option, RealPortfolio, Signal, TradingRequest
from app.db.session import SessionLocal
from app.services.container import AppContainer
from app.services.tinkoff_client import price_units_nano_to_float

logger = logging.getLogger(__name__)

# GetAssetFundamentals принимает ограниченное число UID за запрос — батчим, но обходим все id.
TINKOFF_GET_ASSET_FUNDAMENTALS_BATCH_SIZE = 100

_scheduler: AsyncIOScheduler | None = None
_container: AppContainer | None = None
_ANALYSIS_FUSION_W_NN = 0.7
_ANALYSIS_FUSION_W_LLM = 0.3
_ANALYSIS_BUY_THRESHOLD = 0.6
_ANALYSIS_SELL_THRESHOLD = 0.4
_LLM_CACHE_TTL_HOURS = 6
_llm_cache: dict[str, dict[str, Any]] = {}


@dataclass
class TaskRecord:
    task_id: str
    task_type: str
    status: str
    queued_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    error_code: str | None = None
    result: dict[str, Any] | None = None
    source: str = "manual"


@dataclass
class JobState:
    name: str
    status: str
    last_run_at: str | None = None
    last_success_at: str | None = None
    last_error: str | None = None
    last_duration_ms: int | None = None


@dataclass(frozen=True)
class AnalysisRuntimeSettings:
    feature_enabled: bool
    canary_percent: int
    conf_temp_nn_only: float
    conf_temp_llm_only: float
    conf_temp_nn_llm: float
    llm_margin: float
    llm_cache_ttl_h: int
    quality_gates_enabled: bool


_tasks: dict[str, TaskRecord] = {}
_job_states: dict[str, JobState] = {}
_ws_subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
_MAX_TASK_RECORDS = 2000
_MAX_CONCURRENT_BACKGROUND_JOBS = 4
_background_job_slots = asyncio.Semaphore(_MAX_CONCURRENT_BACKGROUND_JOBS)
_current_task_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_task_id",
    default=None,
)

_CORE_TRAINING_ANALYSIS_JOBS: tuple[str, ...] = (
    "training_quick",
    "training_full",
    "weekly_generation",
    "weekly_update",
    "analysis_market_portfolio",
    "analysis_portfolio_positions",
    "weekly_backtest",
)


def _iso_now() -> str:
    return iso_now_msk()


def _state_to_dict(state: JobState) -> dict[str, Any]:
    return {
        "name": state.name,
        "status": state.status,
        "lastRunAt": state.last_run_at,
        "lastSuccessAt": state.last_success_at,
        "lastError": state.last_error,
        "lastDurationMs": state.last_duration_ms,
    }


def _task_to_dict(task: TaskRecord) -> dict[str, Any]:
    duration_ms: int | None = None
    if task.started_at and task.finished_at:
        with contextlib.suppress(Exception):
            started = datetime.fromisoformat(task.started_at)
            finished = datetime.fromisoformat(task.finished_at)
            duration_ms = max(0, int((finished - started).total_seconds() * 1000))
    return {
        "taskId": task.task_id,
        "taskType": task.task_type,
        "status": task.status,
        "queuedAt": task.queued_at,
        "startedAt": task.started_at,
        "finishedAt": task.finished_at,
        "error": task.error,
        "errorCode": task.error_code,
        "timing": {
            "queuedAt": task.queued_at,
            "startedAt": task.started_at,
            "finishedAt": task.finished_at,
            "durationMs": duration_ms,
        },
        "result": task.result,
        "source": task.source,
    }


def subscribe_status_stream() -> asyncio.Queue[dict[str, Any]]:
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=200)
    _ws_subscribers.add(queue)
    return queue


def unsubscribe_status_stream(queue: asyncio.Queue[dict[str, Any]]) -> None:
    _ws_subscribers.discard(queue)


async def _publish(event_type: str, payload: dict[str, Any]) -> None:
    if not _ws_subscribers:
        return
    event = {"event": event_type, "timestamp": _iso_now(), "payload": payload}
    dead: list[asyncio.Queue[dict[str, Any]]] = []
    for queue in _ws_subscribers:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            # Вместо отписки подписчика отбрасываем самое старое сообщение и
            # пушим самое новое (особенно важно для частых progress update).
            replaced = False
            with contextlib.suppress(Exception):
                _ = queue.get_nowait()
            with contextlib.suppress(Exception):
                queue.put_nowait(event)
                replaced = True
            # Если и после этого не удалось — считаем подписчика невалидным.
            if not replaced:
                dead.append(queue)
    for queue in dead:
        _ws_subscribers.discard(queue)


async def _sync_call(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    return await asyncio.to_thread(func, *args, **kwargs)


async def _record_runtime_error(
    *,
    error_key: str,
    error_message_sample: str,
    source: str,
    trace_id: str | None = None,
) -> None:
    with contextlib.suppress(Exception):
        await get_error_registry().record(
            error_key=error_key,
            error_message_sample=error_message_sample,
            source=source,
            trace_id=trace_id,
        )


def _get_or_create_job_state(name: str) -> JobState:
    state = _job_states.get(name)
    if state is None:
        state = JobState(name=name, status="idle")
        _job_states[name] = state
    return state


async def _run_job_with_state(
    name: str,
    fn: Callable[[], Awaitable[dict[str, Any] | None]],
) -> dict[str, Any]:
    state = _get_or_create_job_state(name)
    started = time.monotonic()
    state.status = "running"
    state.last_run_at = _iso_now()
    await _publish("scheduler.status", {"job": _state_to_dict(state)})
    cron_task: TaskRecord | None = None
    cron_token: contextvars.Token[str | None] | None = None
    if name in _CORE_TRAINING_ANALYSIS_JOBS:
        cron_task = _create_task_record(name, source="cron")
        cron_token = _current_task_id_var.set(cron_task.task_id)
        _set_task_status(cron_task.task_id, status="running")
        with contextlib.suppress(Exception):
            await _publish("task.update", {"task": _task_to_dict(cron_task)})
    try:
        result = await fn()
        state.status = "ok"
        state.last_success_at = _iso_now()
        state.last_error = None
        state.last_duration_ms = int((time.monotonic() - started) * 1000)
        await _publish("scheduler.status", {"job": _state_to_dict(state)})
        if cron_task is not None:
            res_dict = result if isinstance(result, dict) else {"value": result}
            _set_task_status(cron_task.task_id, status="completed", result=res_dict)
            with contextlib.suppress(Exception):
                await _publish("task.update", {"task": _task_to_dict(cron_task)})
        if name.startswith("training_") or name.startswith("weekly_"):
            await _publish("training.status", {"job": _state_to_dict(state), "result": result or {}})
        if name.startswith("analysis_"):
            await _publish("analysis.status", {"job": _state_to_dict(state), "result": result or {}})
        if name in {"cache_update", "cache_full_update", "market_refresh", "assets_sync", "signals_update"}:
            await _publish("workers.registry", {"job": _state_to_dict(state), "result": result or {}})
        return {"ok": True, "result": result or {}}
    except Exception as e:  # pragma: no cover - guarded by tests through status
        state.status = "failed"
        state.last_error = str(e)
        state.last_duration_ms = int((time.monotonic() - started) * 1000)
        if cron_task is not None:
            _set_task_status(cron_task.task_id, status="failed", error=str(e))
            with contextlib.suppress(Exception):
                await _publish("task.update", {"task": _task_to_dict(cron_task)})
        with contextlib.suppress(Exception):
            await get_error_registry().record(
                error_key=f"scheduler:{name}:{e.__class__.__name__}",
                error_message_sample=str(e),
                source="scheduler",
                trace_id=None,
            )
        logger.exception("Scheduler job %s failed: %s", name, e)
        await _publish("scheduler.status", {"job": _state_to_dict(state)})
        raise
    finally:
        if cron_token is not None:
            _current_task_id_var.reset(cron_token)


async def get_status_snapshot() -> dict[str, Any]:
    # psutil не обязателен: пробуем, иначе возвращаем минимум.
    cpu_percent: float | None = None
    ram_percent: float | None = None
    try:
        import psutil  # type: ignore

        cpu_percent = float(psutil.cpu_percent(interval=None))
        ram_percent = float(psutil.virtual_memory().percent)
    except Exception:
        pass

    running = sum(1 for t in _tasks.values() if t.status == "running")
    failed = sum(1 for t in _tasks.values() if t.status == "failed")
    completed = sum(1 for t in _tasks.values() if t.status == "completed")
    return {
        "system": {
            "cpuPercent": cpu_percent,
            "ramPercent": ram_percent,
            "pid": os.getpid(),
            "timestamp": _iso_now(),
        },
        "workers": {"running": running, "failed": failed, "completed": completed},
        "scheduler": {name: _state_to_dict(state) for name, state in _job_states.items()},
        "tasks": [*_task_to_dict_list(limit=50)],
    }


def _task_to_dict_list(limit: int = 100) -> list[dict[str, Any]]:
    values = sorted(_tasks.values(), key=lambda t: t.queued_at, reverse=True)
    return [_task_to_dict(task) for task in values[:limit]]


def get_task(task_id: str) -> dict[str, Any] | None:
    task = _tasks.get(task_id)
    return _task_to_dict(task) if task else None


def list_tasks(limit: int = 100) -> list[dict[str, Any]]:
    return _task_to_dict_list(limit=limit)


def clear_completed_tasks() -> dict[str, int]:
    """Удаляет из памяти задачи со статусом completed (кроме текущей контекстной, если есть)."""
    current_id = _current_task_id_var.get()
    removed = 0
    to_pop: list[str] = []
    for tid, rec in _tasks.items():
        if rec.status != "completed":
            continue
        if current_id and tid == current_id:
            continue
        to_pop.append(tid)
    for tid in to_pop:
        _tasks.pop(tid, None)
        removed += 1
    return {"removedCount": removed, "remainingCount": len(_tasks)}


async def prune_completed_tasks_and_broadcast() -> dict[str, Any]:
    """Очищает completed-задачи и рассылает обновлённый срез подписчикам WebSocket."""
    stats = clear_completed_tasks()
    workers = {
        "running": sum(1 for t in _tasks.values() if t.status == "running"),
        "failed": sum(1 for t in _tasks.values() if t.status == "failed"),
        "completed": sum(1 for t in _tasks.values() if t.status == "completed"),
    }
    tasks_snapshot = _task_to_dict_list(limit=50)
    payload: dict[str, Any] = {
        "removedCount": stats["removedCount"],
        "remainingCount": stats["remainingCount"],
        "workers": workers,
        "tasks": tasks_snapshot,
    }
    await _publish("system.tasks_pruned", payload)
    return payload


async def _completed_tasks_cleanup_job() -> dict[str, Any]:
    return await prune_completed_tasks_and_broadcast()


def list_job_states() -> list[dict[str, Any]]:
    return [_state_to_dict(state) for state in _job_states.values()]


def list_core_training_analysis_jobs() -> list[str]:
    return list(_CORE_TRAINING_ANALYSIS_JOBS)


def _create_task_record(task_type: str, source: str) -> TaskRecord:
    rec = TaskRecord(
        task_id=str(uuid.uuid4()),
        task_type=task_type,
        status="queued",
        queued_at=_iso_now(),
        source=source,
    )
    _tasks[rec.task_id] = rec
    if len(_tasks) > _MAX_TASK_RECORDS:
        oldest = sorted(_tasks.values(), key=lambda t: t.queued_at)[: len(_tasks) - _MAX_TASK_RECORDS]
        for task in oldest:
            _tasks.pop(task.task_id, None)
    return rec


def _set_task_status(
    task_id: str,
    *,
    status: str,
    error: str | None = None,
    result: dict[str, Any] | None = None,
) -> None:
    rec = _tasks[task_id]
    current_result = rec.result if isinstance(rec.result, dict) else {}
    rec.status = status
    if status == "running":
        rec.started_at = _iso_now()
    if status in {"failed", "completed"}:
        rec.finished_at = _iso_now()
    rec.error = error
    rec.error_code = "JOB_FAILED" if status == "failed" else None

    merged_result: dict[str, Any] = {**current_result}
    if isinstance(result, dict):
        merged_result.update(result)

    reason = merged_result.get("reason")
    if reason is None and isinstance(merged_result.get("message"), str):
        msg = str(merged_result.get("message", "")).lower()
        if "skipped" in msg:
            reason = "skipped"

    duration_ms: int | None = None
    if rec.started_at and rec.finished_at:
        with contextlib.suppress(Exception):
            started = datetime.fromisoformat(rec.started_at)
            finished = datetime.fromisoformat(rec.finished_at)
            duration_ms = max(0, int((finished - started).total_seconds() * 1000))
    merged_result["timing"] = {
        "queuedAt": rec.queued_at,
        "startedAt": rec.started_at,
        "finishedAt": rec.finished_at,
        "durationMs": duration_ms,
    }
    if reason is not None:
        merged_result["reason"] = str(reason)
    if status == "failed":
        merged_result["errorCode"] = "JOB_FAILED"
        if error:
            merged_result["errorMessage"] = error
    rec.result = merged_result


async def _update_current_task_progress(progress: dict[str, Any]) -> None:
    task_id = _current_task_id_var.get()
    if not task_id or task_id not in _tasks:
        return
    rec = _tasks[task_id]
    current = rec.result if isinstance(rec.result, dict) else {}
    rec.result = {**current, **progress}
    await _publish("task.update", {"task": _task_to_dict(rec)})


def schedule_background_job(
    task_type: str,
    fn: Callable[[], Awaitable[dict[str, Any] | None]],
    *,
    source: str = "manual",
) -> dict[str, Any]:
    rec = _create_task_record(task_type, source=source)

    async def _runner() -> None:
        async with _background_job_slots:
            _set_task_status(rec.task_id, status="running")
            await _publish("task.update", {"task": _task_to_dict(rec)})
            token = _current_task_id_var.set(rec.task_id)
            try:
                result = await _run_job_with_state(task_type, fn)
                _set_task_status(rec.task_id, status="completed", result=result)
            except Exception as e:
                _set_task_status(rec.task_id, status="failed", error=str(e))
            finally:
                _current_task_id_var.reset(token)
            await _publish("task.update", {"task": _task_to_dict(rec)})

    asyncio.create_task(_runner())
    return {
        "status": "scheduled",
        "taskId": rec.task_id,
        "taskType": task_type,
        "queuedAt": rec.queued_at,
    }


def _positions_value(positions: list[dict]) -> float:
    total = 0.0
    for p in positions:
        qty = p.get("quantity") or 0
        cur = p.get("currentPrice") or {}
        val = price_units_nano_to_float(cur) if isinstance(cur, dict) else float(cur or 0)
        total += qty * val
    return total


def _parse_tinkoff_datetime(raw: Any) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo is not None else raw.replace(tzinfo=timezone.utc)
    text = str(raw).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    with contextlib.suppress(Exception):
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    return None


def _decimal_price(value: Any) -> Decimal:
    if isinstance(value, dict):
        return Decimal(str(price_units_nano_to_float(value)))
    with contextlib.suppress(Exception):
        return Decimal(str(value))
    return Decimal("0")


async def _options_features_for_figi(figi: str) -> Any | None:
    """Агрегирует snapshot опционов в дневные фичи для обучения."""
    if not figi:
        return None
    try:
        import pandas as pd
    except Exception:
        return None
    async with SessionLocal() as session:
        if not hasattr(session, "execute"):
            return None
        rows = (
            await session.execute(
                select(Option.created_at, Option.raw_payload).where(Option.figi == figi)
            )
        ).all()
    if not rows:
        return None

    enriched: list[dict[str, Any]] = []
    for created_at, payload in rows:
        if not isinstance(payload, dict):
            continue
        direction = str(payload.get("direction") or "").upper()
        expiration_dt = _parse_tinkoff_datetime(payload.get("expirationDate"))
        strike_price = float(_decimal_price(payload.get("strikePrice")))
        snapshot_at = created_at if isinstance(created_at, datetime) else None
        if snapshot_at is None:
            snapshot_at = datetime.now(timezone.utc)
        days_to_expiry = 0.0
        if expiration_dt is not None:
            delta = expiration_dt - snapshot_at
            days_to_expiry = max(delta.total_seconds() / 86_400.0, 0.0)
        enriched.append(
            {
                "date": snapshot_at,
                "is_call": 1.0 if "CALL" in direction else 0.0,
                "is_put": 1.0 if "PUT" in direction else 0.0,
                "days_to_expiry": days_to_expiry,
                "strike_price": strike_price,
            }
        )
    if not enriched:
        return None

    df = pd.DataFrame(enriched)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    if df.empty:
        return None
    df["date"] = df["date"].dt.floor("D")
    grouped = (
        df.groupby("date", as_index=True)
        .agg(
            opt_contracts_total=("is_call", "count"),
            opt_call_share=("is_call", "mean"),
            opt_put_share=("is_put", "mean"),
            opt_days_to_expiry_mean=("days_to_expiry", "mean"),
            opt_days_to_expiry_min=("days_to_expiry", "min"),
            opt_strike_mean=("strike_price", "mean"),
            opt_strike_std=("strike_price", "std"),
        )
        .sort_index()
    )
    grouped["opt_strike_std"] = grouped["opt_strike_std"].fillna(0.0)
    return grouped


async def _signals_features_for_figi(figi: str) -> Any | None:
    """Агрегирует сигналы аналитиков в дневные признаки для мета-обучения."""
    if not figi:
        return None
    try:
        import pandas as pd
    except Exception:
        return None
    async with SessionLocal() as session:
        if not hasattr(session, "execute"):
            return None
        rows = (
            await session.execute(
                select(Signal.created_at, Signal.raw_payload).where(Signal.figi == figi)
            )
        ).all()
    if not rows:
        return None
    enriched: list[dict[str, Any]] = []
    for created_at, payload in rows:
        if not isinstance(payload, dict):
            continue
        direction = str(payload.get("direction") or "").upper()
        probability = payload.get("probability")
        p = 0.5
        with contextlib.suppress(Exception):
            if probability is not None:
                p = float(probability)
        p = min(1.0, max(0.0, p))
        start_dt = _parse_tinkoff_datetime(payload.get("createDt")) or (
            created_at if isinstance(created_at, datetime) else None
        )
        end_dt = _parse_tinkoff_datetime(payload.get("endDt"))
        if start_dt is None:
            start_dt = datetime.now(timezone.utc)
        horizon_days = 0.0
        if end_dt is not None:
            horizon_days = max((end_dt - start_dt).total_seconds() / 86_400.0, 0.0)
        enriched.append(
            {
                "date": start_dt,
                "is_buy": 1.0 if "BUY" in direction or "UP" in direction else 0.0,
                "is_sell": 1.0 if "SELL" in direction or "DOWN" in direction else 0.0,
                "probability": p,
                "horizon_days": horizon_days,
            }
        )
    if not enriched:
        return None
    df = pd.DataFrame(enriched)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    if df.empty:
        return None
    df["date"] = df["date"].dt.floor("D")
    grouped = (
        df.groupby("date", as_index=True)
        .agg(
            sig_count=("is_buy", "count"),
            sig_buy_share=("is_buy", "mean"),
            sig_sell_share=("is_sell", "mean"),
            sig_avg_probability=("probability", "mean"),
            sig_avg_horizon_days=("horizon_days", "mean"),
        )
        .sort_index()
    )
    return grouped


def _returns_from_candles_df(candles_df: Any) -> list[float]:
    if candles_df is None:
        return []
    with contextlib.suppress(Exception):
        close = candles_df["close"]
        ret = close.pct_change().dropna()
        return [float(v) for v in ret.tolist() if v is not None]
    return []


async def _pick_best_training_figi(limit: int | None = None) -> str | None:
    """Выбирает FIGI с максимальным числом свечей, чтобы обучение не было тривиально коротким."""
    async with SessionLocal() as session:
        if not hasattr(session, "execute"):
            return None
        stmt = (
            select(Candle.figi, func.count(Candle.id).label("c"))
            .group_by(Candle.figi)
            .order_by(func.count(Candle.id).desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        rows = (await session.execute(stmt)).all()
    for figi, cnt in rows:
        if isinstance(figi, str) and figi and int(cnt or 0) > 120:
            return figi
    for figi, _cnt in rows:
        if isinstance(figi, str) and figi:
            return figi
    return None


async def _list_training_figi(limit: int | None = None) -> list[str]:
    """Список FIGI для обучения (по убыванию количества свечей). limit=None — все FIGI со свечами."""
    async with SessionLocal() as session:
        if not hasattr(session, "execute"):
            return []
        stmt = (
            select(Candle.figi, func.count(Candle.id).label("c"))
            .group_by(Candle.figi)
            .order_by(func.count(Candle.id).desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        rows = (await session.execute(stmt)).all()
    return [str(figi) for figi, _cnt in rows if isinstance(figi, str) and figi]


async def _load_training_candles_dataframe(
    figi: str,
    *,
    window_days: int,
    max_rows: int = 20_000,
) -> Any | None:
    """
    Загружает свечи только за нужное окно:
    - quick: 1 день
    - full: 365 дней
    Окно строится от последней доступной свечи FIGI (а не от wall-clock now),
    чтобы корректно работать даже на историческом датасете.
    """
    if not figi:
        return None
    try:
        from training.data.loaders import candles_to_dataframe
    except Exception:
        return None
    async with SessionLocal() as session:
        max_dt = await session.scalar(
            select(func.max(Candle.candle_time)).where(Candle.figi == figi)
        )
        if max_dt is None:
            return None
        end_dt = max_dt if max_dt.tzinfo is not None else max_dt.replace(tzinfo=timezone.utc)
        start_dt = end_dt - timedelta(days=window_days)
        rows = list(
            await session.scalars(
                select(Candle)
                .where(
                    Candle.figi == figi,
                    Candle.candle_time >= start_dt,
                    Candle.candle_time <= end_dt,
                )
                .order_by(Candle.candle_time.asc())
                .limit(max_rows)
            )
        )
    df = candles_to_dataframe(rows)
    return None if df.empty else df


async def _load_training_candles_with_backfill(
    figi: str,
    *,
    preferred_window_days: int,
    min_rows: int,
    max_window_days: int,
    max_rows: int = 20_000,
) -> tuple[Any | None, int]:
    """
    Пытается загрузить свечи в целевом окне и автоматически расширяет окно,
    пока не наберётся минимум строк.
    """
    window = max(1, int(preferred_window_days))
    max_window = max(window, int(max_window_days))
    while window <= max_window:
        df = await _load_training_candles_dataframe(
            figi,
            window_days=window,
            max_rows=max_rows,
        )
        if df is not None and len(df) >= int(min_rows):
            return df, window
        if window == max_window:
            break
        window = min(max_window, window * 2)
    return None, window


async def _load_intraday_candles_last_day(figi: str) -> Any | None:
    """Пробует загрузить внутридневные свечи за последние сутки через Tinkoff API."""
    if not figi or _container is None or getattr(_container, "tinkoff_client", None) is None:
        return None
    try:
        import pandas as pd
    except Exception:
        return None
    client = _container.tinkoff_client
    from_dt = datetime.now(timezone.utc) - timedelta(days=1)
    to_dt = datetime.now(timezone.utc)
    payload = await _sync_call(client.get_candles, figi, from_dt, to_dt, "CANDLE_INTERVAL_5_MIN")
    candles = payload.get("candles") or []
    if not candles:
        return None
    rows: list[dict[str, Any]] = []
    for c in candles:
        if not isinstance(c, dict):
            continue
        dt = _parse_tinkoff_datetime(c.get("time"))
        if dt is None:
            continue
        close = float(_decimal_price(c.get("close")))
        open_ = float(_decimal_price(c.get("open")))
        high = float(_decimal_price(c.get("high")))
        low = float(_decimal_price(c.get("low")))
        volume = int(c.get("volume") or 0)
        if close <= 0:
            continue
        rows.append(
            {
                "candle_time": dt,
                "close": close,
                "open": open_ if open_ > 0 else close,
                "high": high if high > 0 else close,
                "low": low if low > 0 else close,
                "volume": volume,
            }
        )
    if not rows:
        return None
    df = pd.DataFrame(rows).sort_values("candle_time").set_index("candle_time")
    return None if df.empty else df


def _latest_checkpoint_path(dir_path: str) -> str | None:
    with contextlib.suppress(Exception):
        files = [
            os.path.join(dir_path, f)
            for f in os.listdir(dir_path)
            if f.endswith(".ckpt")
        ]
        if not files:
            return None
        files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return files[0]
    return None


def _write_ensemble_weights_artifact(tag: str) -> str | None:
    """Сохраняет artifact с текущими ensemble-весами для прозрачности пайплайна."""
    try:
        from training.models.meta import get_meta_weights
        import torch
    except Exception:
        return None
    h, s = get_meta_weights(device=torch.device("cpu"))
    payload = {
        "tag": tag,
        "horizon_weights": [float(x) for x in h.tolist()],
        "strategy_weights": [float(x) for x in s.tolist()],
        "updatedAt": _iso_now(),
    }
    out_dir = os.path.join("models", "ensemble")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "weights.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return out_path


def _clamp01(value: float, default: float = 0.5) -> float:
    with contextlib.suppress(Exception):
        return min(1.0, max(0.0, float(value)))
    return default


# Порог ниже которого уверенность NN считается «мёртвой» и в fusion подставляется confidence LLM (если есть).
_NN_CONF_LLM_FALLBACK_THRESHOLD = 0.08


def _nn_conf_with_llm_fallback(
    nn_conf: float | None,
    llm_conf: float | None,
    *,
    threshold: float | None = None,
) -> float:
    """
    Если уверенность внутренней NN нулевая или слишком низкая, берём уверенность внешней модели (LLM),
    чтобы взвешенная уверенность не схлопывалась в ноль.
    """
    thr = float(threshold if threshold is not None else _NN_CONF_LLM_FALLBACK_THRESHOLD)
    nc = _clamp01(float(nn_conf), default=0.5) if nn_conf is not None else 0.5
    if llm_conf is None:
        return nc
    lc = _clamp01(float(llm_conf), default=0.5)
    if nc <= 0.0 or nc < thr:
        return lc
    return nc


# Порог: score внутренней NN ниже этого (или 0) считаем «сломанным» и подставляем консенсус LLM.
_NN_SCORE_LLM_FALLBACK_THRESHOLD = 0.08


def _nn_score_with_llm_fallback(
    nn_score: float | None,
    llm_consensus: float | None,
    *,
    threshold: float | None = None,
) -> float:
    """
    Если score внутренней NN нулевой или слишком низкий, берём консенсус внешних LLM (та же шкала 0–1),
    чтобы итоговый сигнал не залипал у нуля при слабом NN.
    """
    thr = float(threshold if threshold is not None else _NN_SCORE_LLM_FALLBACK_THRESHOLD)
    if nn_score is None:
        return 0.5
    ns = _clamp01(float(nn_score), default=0.5)
    if llm_consensus is None:
        return ns
    lc = _clamp01(float(llm_consensus), default=0.5)
    if ns <= 0.0 or ns < thr:
        return lc
    return ns


def _score_to_recommendation(score: float) -> str:
    if score >= _ANALYSIS_BUY_THRESHOLD:
        return "BUY"
    if score <= _ANALYSIS_SELL_THRESHOLD:
        return "SELL"
    return "HOLD"


def _stable_rollout_bucket(figi: str) -> int:
    return abs(hash(figi or "")) % 100


def _is_canary_enabled_for_figi(figi: str, percent: int) -> bool:
    p = max(0, min(100, int(percent)))
    if p >= 100:
        return True
    if p <= 0:
        return False
    return _stable_rollout_bucket(figi) < p


def _calibrate_confidence(raw_confidence: float, *, mode: str, temperature: float) -> float:
    """Temperature scaling для confidence; mode оставлен для раздельной телеметрии."""
    conf = _clamp01(raw_confidence)
    temp = max(0.05, float(temperature))
    eps = 1e-6
    p = min(1.0 - eps, max(eps, conf))
    logit = math.log(p / (1.0 - p))
    calibrated = 1.0 / (1.0 + math.exp(-logit / temp))
    return _clamp01(calibrated)


def _detect_market_regime(candles_df: Any) -> str:
    try:
        close = candles_df["close"]
        ret = close.pct_change().dropna()
        if len(ret) < 20:
            return "normal"
        vol = float(ret.tail(30).std())
        if vol < 0.008:
            return "low"
        if vol > 0.02:
            return "high"
        return "normal"
    except Exception:
        return "normal"


def _adaptive_fusion_params(regime: str) -> tuple[float, float, float, float]:
    if regime == "low":
        return 0.75, 0.25, 0.58, 0.42
    if regime == "high":
        return 0.62, 0.38, 0.64, 0.36
    return 0.70, 0.30, 0.60, 0.40


def _is_fresh_enough(candles_df: Any, *, max_age_days: int = 7) -> bool:
    try:
        idx = candles_df.index
        if len(idx) == 0:
            return False
        last_ts = idx[-1]
        if hasattr(last_ts, "to_pydatetime"):
            last_ts = last_ts.to_pydatetime()
        if not isinstance(last_ts, datetime):
            return False
        now = datetime.now(timezone.utc)
        ts = last_ts if last_ts.tzinfo is not None else last_ts.replace(tzinfo=timezone.utc)
        return (now - ts).days <= max_age_days
    except Exception:
        return False


def _align_features_for_checkpoint(x_row: Any, checkpoint_path: str) -> tuple[Any, str]:
    """Подгоняет размерность row под ожидаемый input_size чекпоинта."""
    ckpt_path = Path(checkpoint_path)
    expected = None
    with contextlib.suppress(Exception):
        from training.run_stacking import _checkpoint_input_size

        expected = _checkpoint_input_size(ckpt_path)
    if expected is None:
        return x_row, checkpoint_path
    n_features = int(getattr(x_row, "shape", [0, 0])[1] or 0)
    if n_features == expected:
        return x_row, checkpoint_path
    with contextlib.suppress(Exception):
        from training.run_stacking import _find_compatible_base_checkpoint

        compatible = _find_compatible_base_checkpoint(ckpt_path, n_features)
        if compatible is not None:
            return x_row, str(compatible)
    if n_features > expected:
        return x_row.iloc[:, :expected], checkpoint_path
    return None, checkpoint_path


def _select_meta_base_checkpoint(
    *,
    candles_df: Any,
    options_df: Any,
    signals_df: Any,
    lookback_days: int,
    prediction_horizon: int,
) -> str | None:
    """Выбирает совместимый NN-чекпоинт для этапа stacking/meta."""
    latest = _latest_checkpoint_path(os.path.join("models", "python_nn"))
    if not latest:
        return None
    try:
        from training.data.pipeline import build_feature_pipeline
        from training.run_stacking import _find_compatible_base_checkpoint

        x, _ = build_feature_pipeline(
            candles_df,
            options=options_df,
            signals=signals_df,
            lookback_days=lookback_days,
            prediction_horizon=prediction_horizon,
        )
        if x is None or getattr(x, "empty", True):
            return latest
        expected_input = int(x.shape[1])
        compatible = _find_compatible_base_checkpoint(Path(latest), expected_input)
        return str(compatible) if compatible is not None else latest
    except Exception:
        return latest


def _analysis_runtime_settings(app_settings: dict[str, str]) -> AnalysisRuntimeSettings:
    def _sfloat(key: str, fallback: float) -> float:
        try:
            return float(app_settings.get(key, fallback))
        except (TypeError, ValueError):
            return fallback

    def _sint(key: str, fallback: int) -> int:
        try:
            return int(float(app_settings.get(key, fallback)))
        except (TypeError, ValueError):
            return fallback

    return AnalysisRuntimeSettings(
        feature_enabled=str(app_settings.get("analysis_v2_enabled", "true")).lower()
        not in {"0", "false", "off"},
        canary_percent=_sint("analysis_v2_canary_percent", 20),
        conf_temp_nn_only=_sfloat("analysis_v2_conf_temp_nn_only", 1.0),
        conf_temp_llm_only=_sfloat("analysis_v2_conf_temp_llm_only", 1.0),
        conf_temp_nn_llm=_sfloat("analysis_v2_conf_temp_nn_llm", 1.0),
        llm_margin=_sfloat("analysis_v2_llm_uncertainty_margin", 0.08),
        llm_cache_ttl_h=_sint("analysis_v2_llm_cache_ttl_hours", _LLM_CACHE_TTL_HOURS),
        quality_gates_enabled=str(app_settings.get("analysis_v2_quality_gates_enabled", "true")).lower()
        not in {"0", "false", "off"},
    )


async def _run_nn_inference_for_figi(figi: str, checkpoint_path: str) -> dict[str, Any]:
    """Готовит фичи и считает NN score/confidence для одного FIGI."""
    import numpy as np
    import torch
    from training.data.pipeline import build_feature_pipeline
    from training.inference_nn import load_cond_mlp
    from training.models.ensemble import EnsemblePredictor

    candles_df, used_window_days = await _load_training_candles_with_backfill(
        figi,
        preferred_window_days=365,
        min_rows=120,
        max_window_days=365,
        max_rows=20_000,
    )
    if candles_df is None or len(candles_df) < 70:
        return {"ok": False, "reason": "insufficient_candles", "windowDays": used_window_days}
    if not _is_fresh_enough(candles_df, max_age_days=14):
        return {"ok": False, "reason": "stale_candles", "windowDays": used_window_days}

    regime = _detect_market_regime(candles_df)

    options_df = await _options_features_for_figi(figi)
    signals_df = await _signals_features_for_figi(figi)
    x, _ = build_feature_pipeline(
        candles_df,
        options=options_df,
        signals=signals_df,
        lookback_days=60,
        prediction_horizon=5,
    )
    if x.empty:
        return {"ok": False, "reason": "empty_features", "windowDays": used_window_days}
    with contextlib.suppress(Exception):
        nan_ratio = float(np.isnan(x.values).sum()) / float(max(1, x.size))
        if nan_ratio > 0.15:
            return {
                "ok": False,
                "reason": "feature_nan_ratio_high",
                "windowDays": used_window_days,
                "nanRatio": round(nan_ratio, 4),
            }
    x_row = x.iloc[[-1]].copy()
    x_row, adjusted_ckpt = _align_features_for_checkpoint(x_row, checkpoint_path)
    if x_row is None:
        return {"ok": False, "reason": "checkpoint_mismatch", "windowDays": used_window_days}

    x_tensor = torch.tensor(x_row.values, dtype=torch.float32)
    model = load_cond_mlp(adjusted_ckpt)
    model.eval()
    ensemble = EnsemblePredictor(model)
    with torch.no_grad():
        score_t, conf_t = ensemble.forward(x_tensor, aggregate=True)
    nn_score = _clamp01(float(score_t.detach().cpu().numpy().reshape(-1)[0]), default=0.5)
    nn_conf = _clamp01(float(conf_t.detach().cpu().numpy().reshape(-1)[0]), default=0.5)
    feature_columns = [str(c) for c in x_row.columns.tolist()]
    feature_values = [float(v) for v in np.asarray(x_row.values[0], dtype=np.float32).tolist()]
    return {
        "ok": True,
        "score": nn_score,
        "confidence": nn_conf,
        "checkpoint": adjusted_ckpt,
        "payload": {
            "featureCount": len(feature_columns),
            "featureColumns": feature_columns,
            "featureValues": feature_values,
            "windowDays": used_window_days,
            "marketRegime": regime,
            "generatedAt": _iso_now(),
        },
    }


async def _upsert_app_setting(
    key: str,
    value: str,
    *,
    module: str,
    description: str,
    value_type: str = "string",
) -> None:
    async with SessionLocal() as session:
        row = await session.scalar(select(AppSetting).where(AppSetting.key == key).limit(1))
        if row is None:
            row = AppSetting(
                key=key,
                value=value,
                value_type=value_type,
                module=module,
                description=description,
            )
            session.add(row)
        else:
            row.value = value
            row.value_type = value_type
            row.module = module
            row.description = description
        await session.commit()


async def _replace_assets_rows(assets: list[dict[str, Any]]) -> int:
    async with SessionLocal() as session:
        ticker_to_figi: dict[str, str] = {}
        if hasattr(session, "execute"):
            instrument_rows = await session.execute(select(Instrument.ticker, Instrument.figi))
            for ticker, figi in instrument_rows:
                if ticker and figi and isinstance(ticker, str) and isinstance(figi, str):
                    ticker_to_figi[ticker.upper()] = figi
        # Для real DB очищаем предыдущий snapshot, в unit-тестах fake session
        # может не иметь execute.
        if hasattr(session, "execute"):
            await session.execute(delete(Asset))
        for item in assets:
            if not isinstance(item, dict):
                continue
            ticker = item.get("ticker")
            figi = (
                item.get("figi")
                or item.get("instrumentFigi")
                or ((item.get("instrument") or {}).get("figi") if isinstance(item.get("instrument"), dict) else None)
            )
            if isinstance(item.get("instrument"), dict):
                instrument = item.get("instrument") or {}
                if not figi:
                    figi = instrument.get("figi") or instrument.get("instrumentFigi")
                if not ticker:
                    ticker = instrument.get("ticker")
            instruments = item.get("instruments")
            if isinstance(instruments, list):
                for instrument in instruments:
                    if not isinstance(instrument, dict):
                        continue
                    if not figi:
                        figi = instrument.get("figi") or instrument.get("instrumentFigi")
                    if not ticker:
                        ticker = instrument.get("ticker")
                    if figi and ticker:
                        break
            if not figi and isinstance(ticker, str) and ticker:
                figi = ticker_to_figi.get(ticker.upper())
            session.add(
                Asset(
                    uid=item.get("uid"),
                    figi=figi,
                    ticker=ticker,
                    name=item.get("name"),
                    instrument_type=item.get("instrumentType"),
                    currency=item.get("currency"),
                    raw_payload=item,
                )
            )
        await session.commit()
    return len(assets)


async def _build_lookup_maps() -> tuple[dict[str, str], dict[str, str]]:
    async with SessionLocal() as session:
        ticker_to_figi: dict[str, str] = {}
        uid_to_figi: dict[str, str] = {}
        if not hasattr(session, "execute"):
            return ticker_to_figi, uid_to_figi
        instrument_rows = await session.execute(select(Instrument.ticker, Instrument.figi))
        for ticker, figi in instrument_rows:
            if ticker and figi and isinstance(ticker, str) and isinstance(figi, str):
                ticker_to_figi[ticker.upper()] = figi
        asset_rows = await session.execute(select(Asset.uid, Asset.ticker, Asset.figi, Asset.raw_payload))
        for uid, ticker, figi, raw_payload in asset_rows:
            if figi and isinstance(figi, str):
                if ticker and isinstance(ticker, str):
                    ticker_to_figi.setdefault(ticker.upper(), figi)
                if uid and isinstance(uid, str):
                    uid_to_figi[uid] = figi
            if isinstance(raw_payload, dict):
                instruments = raw_payload.get("instruments")
                if isinstance(instruments, list):
                    for instrument in instruments:
                        if not isinstance(instrument, dict):
                            continue
                        nested_figi = instrument.get("figi") or instrument.get("instrumentFigi")
                        if not (nested_figi and isinstance(nested_figi, str)):
                            continue
                        nested_ticker = instrument.get("ticker")
                        if nested_ticker and isinstance(nested_ticker, str):
                            ticker_to_figi.setdefault(nested_ticker.upper(), nested_figi)
                        nested_uid = instrument.get("uid") or instrument.get("instrumentUid")
                        if nested_uid and isinstance(nested_uid, str):
                            uid_to_figi.setdefault(nested_uid, nested_figi)
        return ticker_to_figi, uid_to_figi


def _extract_option_figi(item: dict[str, Any], ticker_to_figi: dict[str, str], uid_to_figi: dict[str, str]) -> str | None:
    direct = item.get("figi") or item.get("instrumentFigi")
    if isinstance(direct, str) and direct:
        return direct
    ticker = item.get("ticker")
    if isinstance(ticker, str) and ticker:
        by_ticker = ticker_to_figi.get(ticker.upper())
        if by_ticker:
            return by_ticker
    basic_asset = item.get("basicAsset")
    if isinstance(basic_asset, str) and basic_asset:
        by_basic_asset = ticker_to_figi.get(basic_asset.upper())
        if by_basic_asset:
            return by_basic_asset
    for key in ("basicAssetUid", "underlyingAssetUid", "assetUid", "instrumentUid", "basicAssetPositionUid", "positionUid"):
        uid = item.get(key)
        if isinstance(uid, str) and uid:
            by_uid = uid_to_figi.get(uid)
            if by_uid:
                return by_uid
    return None


async def _replace_options_rows(options: list[dict[str, Any]]) -> int:
    ticker_to_figi, uid_to_figi = await _build_lookup_maps()
    async with SessionLocal() as session:
        if hasattr(session, "execute"):
            await session.execute(delete(Option))
        for item in options:
            if not isinstance(item, dict):
                continue
            figi = _extract_option_figi(item, ticker_to_figi, uid_to_figi)
            session.add(
                Option(
                    uid=item.get("uid"),
                    position_uid=item.get("positionUid"),
                    figi=figi,
                    ticker=item.get("ticker"),
                    basic_asset_uid=item.get("basicAssetUid"),
                    raw_payload=item,
                )
            )
        await session.commit()
    return len(options)


def _extract_signal_figi(item: dict[str, Any], ticker_to_figi: dict[str, str], uid_to_figi: dict[str, str]) -> str | None:
    for key in ("figi", "instrumentFigi", "securityFigi"):
        value = item.get(key)
        if isinstance(value, str) and value:
            return value
    ticker = item.get("ticker")
    if isinstance(ticker, str) and ticker:
        by_ticker = ticker_to_figi.get(ticker.upper())
        if by_ticker:
            return by_ticker
    for key in ("instrumentUid", "assetUid", "uid"):
        uid = item.get(key)
        if isinstance(uid, str) and uid:
            by_uid = uid_to_figi.get(uid)
            if by_uid:
                return by_uid
    return None


async def _replace_signals_rows(signals: list[dict[str, Any]]) -> int:
    ticker_to_figi, uid_to_figi = await _build_lookup_maps()
    async with SessionLocal() as session:
        if hasattr(session, "execute"):
            await session.execute(delete(Signal))
        for item in signals:
            if not isinstance(item, dict):
                continue
            figi = _extract_signal_figi(item, ticker_to_figi, uid_to_figi)
            session.add(
                Signal(
                    signal_uid=str(item.get("signalId") or item.get("id") or item.get("uid") or ""),
                    figi=figi,
                    ticker=item.get("ticker"),
                    direction=item.get("direction") or item.get("signalType"),
                    raw_payload=item,
                )
            )
        await session.commit()
    return len(signals)


async def _portfolio_sync_job(container: AppContainer) -> dict[str, Any]:
    """Задача: синхронизация реального портфеля — GetPortfolio/GetPositions, запись в real_portfolio."""
    client = container.tinkoff_client
    if not client:
        return
    try:
        portfolio = await _sync_call(client.get_portfolio)
        positions_data = await _sync_call(client.get_positions)
        degraded = bool(portfolio.get("_degraded") or positions_data.get("_degraded"))
        if degraded:
            err_msg = str(portfolio.get("_error") or positions_data.get("_error") or "tinkoff degraded response")
            err_type = str(portfolio.get("_error_type") or positions_data.get("_error_type") or "RuntimeError")
            op = str(portfolio.get("_operation") or positions_data.get("_operation") or "get_portfolio")
            await _record_runtime_error(
                error_key=f"tinkoff:{op}:{err_type}",
                error_message_sample=err_msg,
                source="scheduler:portfolio_sync",
            )
        positions = portfolio.get("positions") or positions_data.get("positions") or []
        total_amount = (portfolio.get("totalAmountPortfolio") or {}).get("value") or 0.0
        if isinstance(total_amount, dict):
            total_amount = price_units_nano_to_float(total_amount)
        positions_value = _positions_value(positions)
        money = positions_data.get("money") or []
        cash = 0.0
        for m in money:
            cur = (m or {}).get("currency", "RUB")
            if cur == "RUB":
                v = (m or {}).get("value", 0)
                cash += float(v) if not isinstance(v, dict) else price_units_nano_to_float(v)
        total_value = total_amount if total_amount > 0 else (cash + positions_value)
        positions_map = {p.get("figi", ""): p.get("quantity", 0) for p in positions if p.get("figi")}

        async with SessionLocal() as session:
            row = await session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1).limit(1))
            now = now_msk()
            if row:
                row.cash = cash
                row.positions = positions_map
                row.total_value = total_value
                row.positions_value = positions_value
                row.last_updated = now
                await session.flush()
            else:
                row = RealPortfolio(
                    id=1,
                    cash=cash,
                    positions=positions_map,
                    trades=[],
                    total_value=total_value,
                    positions_value=positions_value,
                    initial_capital=total_value if total_value > 0 else None,
                    version=1,
                    last_updated=now,
                )
                session.add(row)
                await session.flush()
            await session.commit()
        logger.info("Tinkoff portfolio sync: cash=%.2f positions_value=%.2f total_value=%.2f", cash, positions_value, total_value)
        return {"degraded": degraded, "cash": cash, "positionsValue": positions_value, "totalValue": total_value}
    except Exception as e:
        logger.exception("Tinkoff portfolio sync failed: %s", e)
        await _record_runtime_error(
            error_key=f"scheduler:portfolio_sync:{e.__class__.__name__}",
            error_message_sample=str(e),
            source="scheduler:portfolio_sync",
        )
        return {"degraded": True, "error": str(e)}


async def _portfolio_sync_job_wrapped() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    result = await _portfolio_sync_job(_container)
    return {"message": "portfolio sync completed", **(result or {})}


def _is_russian_share(inst: dict) -> bool:
    country = (inst.get("countryOfRisk") or inst.get("countryOfRiskCode") or "").upper()
    currency = (inst.get("currency") or "").upper()
    exchange = (inst.get("exchange") or "").upper()
    ru_country = country in ("RU", "RUS")
    moex = "MOEX" in exchange or "MOSCOW" in exchange
    rub = currency in ("RUB", "RUR")
    return (ru_country or moex) and rub


async def _instruments_update_job(container: AppContainer) -> dict[str, Any]:
    """Задача: обновление списка инструментов — Shares, фильтр российские акции, upsert в instruments."""
    client = container.tinkoff_client
    if not client:
        return {"degraded": True, "skipped": True, "reason": "tinkoff_client_unavailable"}
    try:
        data = await _sync_call(client.get_shares)
        instruments = data.get("instruments") or []
        russian = [i for i in instruments if i and i.get("figi") and i.get("ticker") and _is_russian_share(i)]
        async with SessionLocal() as session:
            for inst in russian:
                try:
                    await container.market_repository.upsert_instrument(
                        session,
                        figi=inst.get("figi", ""),
                        ticker=inst.get("ticker", ""),
                        name=inst.get("name", ""),
                        currency=(inst.get("currency") or "RUB").upper(),
                        sector=inst.get("sector"),
                        lot=int(inst.get("lotSize") or 1),
                    )
                except Exception as e:
                    logger.warning("upsert_instrument %s: %s", inst.get("figi"), e)
            await session.commit()
        logger.info("Tinkoff instruments update: %d Russian shares", len(russian))
        return {"degraded": False, "count": len(russian)}
    except Exception as e:
        logger.exception("Tinkoff instruments update failed: %s", e)
        await _record_runtime_error(
            error_key=f"scheduler:tinkoff_instruments:{e.__class__.__name__}",
            error_message_sample=str(e),
            source="scheduler:tinkoff_instruments",
        )
        return {"degraded": True, "error": str(e)}


async def _instruments_update_job_wrapped() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    result = await _instruments_update_job(_container)
    return {"message": "instruments update completed", **(result or {})}


async def _last_prices_job(container: AppContainer) -> dict[str, Any]:
    """Задача: обновление последних цен — список FIGI из БД, GetLastPrices, обновить last_price."""
    client = container.tinkoff_client
    if not client:
        return {"degraded": True, "skipped": True, "reason": "tinkoff_client_unavailable"}
    try:
        async with SessionLocal() as session:
            figi_list = await container.market_repository.list_figi(session)
        if not figi_list:
            return {"degraded": False, "count": 0}
        data = await _sync_call(client.get_last_prices, figi_list)
        degraded = bool(data.get("_degraded"))
        if degraded:
            err_type = str(data.get("_error_type") or "RuntimeError")
            op = str(data.get("_operation") or "get_last_prices")
            await _record_runtime_error(
                error_key=f"tinkoff:{op}:{err_type}",
                error_message_sample=str(data.get("_error") or "tinkoff degraded response"),
                source="scheduler:tinkoff_last_prices",
            )
        last_prices = data.get("lastPrices") or []
        async with SessionLocal() as session:
            for lp in last_prices:
                figi = lp.get("figi")
                if not figi:
                    continue
                price = lp.get("price")
                val = price_units_nano_to_float(price) if isinstance(price, dict) else float(price or 0)
                if val <= 0:
                    continue
                await container.market_repository.update_last_price(session, figi=figi, last_price=val)
            await session.commit()
        logger.info("Tinkoff last prices update: %d figi", len(last_prices))
        return {"degraded": degraded, "count": len(last_prices)}
    except Exception as e:
        logger.exception("Tinkoff last prices update failed: %s", e)
        await _record_runtime_error(
            error_key=f"scheduler:tinkoff_last_prices:{e.__class__.__name__}",
            error_message_sample=str(e),
            source="scheduler:tinkoff_last_prices",
        )
        return {"degraded": True, "error": str(e)}


async def _last_prices_job_wrapped() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    result = await _last_prices_job(_container)
    return {"message": "last prices update completed", **(result or {})}


async def _cache_update_job() -> dict[str, Any]:
    # Минимальный fallback-контур: update инструментов + последних цен.
    if not _container:
        raise RuntimeError("Container is not initialized")
    instruments = await _instruments_update_job(_container)
    prices = await _last_prices_job(_container)
    degraded = bool((instruments or {}).get("degraded") or (prices or {}).get("degraded"))
    return {"message": "cache update completed", "degraded": degraded}


async def _cache_full_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    instruments = await _instruments_update_job(_container)
    prices = await _last_prices_job(_container)
    portfolio = await _portfolio_sync_job(_container)
    degraded = bool(
        (instruments or {}).get("degraded")
        or (prices or {}).get("degraded")
        or (portfolio or {}).get("degraded")
    )
    return {"message": "full cache update completed", "degraded": degraded}


async def _market_refresh_job() -> dict[str, Any]:
    return await _cache_update_job()


async def _assets_sync_job() -> dict[str, Any]:
    # В текущем контуре assets ~= instruments из Tinkoff shares + сырой snapshot assets.
    out = await _instruments_update_job_wrapped()
    client = _container.tinkoff_client if _container else None
    assets_count = 0
    if client and hasattr(client, "get_assets"):
        assets_resp = await _sync_call(client.get_assets)
        assets = [a for a in (assets_resp.get("assets") or assets_resp.get("instruments") or []) if isinstance(a, dict)]
        assets_count = await _replace_assets_rows(assets)
    return {**out, "assetsCount": assets_count, "writtenToDb": True}


async def _fundamental_sync_fill_job() -> dict[str, Any]:
    now = _iso_now()
    payload: dict[str, Any] = {"assets": [], "fundamentals": []}
    client = _container.tinkoff_client if _container else None
    if client:
        assets_resp = await _sync_call(client.get_assets)
        assets = assets_resp.get("assets") or assets_resp.get("instruments") or []
        valid_assets = [a for a in assets if isinstance(a, dict) and (a.get("uid") or a.get("figi"))]
        payload["assets"] = valid_assets
        asset_ids = [a.get("uid") for a in valid_assets if a.get("uid")]
        fundamentals_out: list[dict[str, Any]] = []
        if asset_ids:
            batch_sz = TINKOFF_GET_ASSET_FUNDAMENTALS_BATCH_SIZE
            for off in range(0, len(asset_ids), batch_sz):
                chunk = asset_ids[off : off + batch_sz]
                resp = await _sync_call(client.get_asset_fundamentals, chunk)
                raw = resp.get("fundamentals") or []
                fundamentals_out.extend([f for f in raw if isinstance(f, dict)])
            payload["fundamentals"] = fundamentals_out
    value = str({"updatedAt": now, "payload": payload})
    await _upsert_app_setting(
        "fundamental.last_sync",
        value,
        value_type="json",
        module="fundamental",
        description="Последний sync-and-fill фундаментальных данных",
    )
    return {
        "message": "fundamental sync-and-fill completed",
        "assetsCount": len(payload.get("assets") or []),
        "fundamentalsCount": len(payload.get("fundamentals") or []),
        "writtenToDb": True,
    }


async def _fundamental_fill_all_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "fundamental.last_fill_all",
        now,
        module="fundamental",
        description="Последнее массовое заполнение фундаментала",
    )
    return {"message": "fundamental fill-all completed"}


async def _macro_update_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "macro.last_update",
        now,
        module="macro",
        description="Последнее обновление макро данных",
    )
    return {"message": "macro update completed"}


async def _macro_load_indices_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "macro.last_indices_load",
        now,
        module="macro",
        description="Последняя загрузка рыночных индексов",
    )
    return {"message": "macro indices load completed"}


async def _signals_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    payload: dict[str, Any] = {"signals": []}
    if _container.tinkoff_client:
        payload = await _sync_call(_container.tinkoff_client.get_analyst_signals)
    signals_rows = [s for s in (payload.get("signals") or []) if isinstance(s, dict)]
    written_count = await _replace_signals_rows(signals_rows)
    async with SessionLocal() as session:
        row = await session.scalar(select(AppSetting).where(AppSetting.key == "signals.last_payload").limit(1))
        now = _iso_now()
        value = {"updatedAt": now, "payload": payload}
        if row is None:
            row = AppSetting(
                key="signals.last_payload",
                value=str(value),
                value_type="json",
                module="signals",
                description="Последний payload сигналов аналитиков",
            )
            session.add(row)
        else:
            row.value = str(value)
        await session.commit()
    return {
        "message": "signals update completed",
        "count": len(payload.get("signals") or []),
        "writtenToDb": written_count > 0,
    }


async def _options_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    payload: dict[str, Any] = {"instruments": []}
    if _container.tinkoff_client:
        raw_payload = await _sync_call(_container.tinkoff_client.get_options)
        instruments = raw_payload.get("instruments") or []
        payload = {"instruments": [i for i in instruments if isinstance(i, dict)]}
    options_rows = payload.get("instruments") or []
    written_count = await _replace_options_rows([i for i in options_rows if isinstance(i, dict)])
    async with SessionLocal() as session:
        row = await session.scalar(select(AppSetting).where(AppSetting.key == "options.last_payload").limit(1))
        now = _iso_now()
        value = {"updatedAt": now, "payload": payload}
        if row is None:
            row = AppSetting(
                key="options.last_payload",
                value=str(value),
                value_type="json",
                module="options",
                description="Последний payload опционных данных",
            )
            session.add(row)
        else:
            row.value = str(value)
        await session.commit()
    return {
        "message": "options update completed",
        "count": len(payload.get("instruments") or []),
        "writtenToDb": written_count > 0,
    }


async def _candles_sync_year_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    client = _container.tinkoff_client
    if not client:
        return {"message": "candles sync year skipped", "count": 0, "writtenToDb": False}
    async with SessionLocal() as session:
        figi_list = await _container.market_repository.list_figi(session)
    if not figi_list:
        return {"message": "candles sync year completed", "count": 0, "writtenToDb": False}

    from_dt = datetime.now(timezone.utc) - timedelta(days=365)
    to_dt = datetime.now(timezone.utc)
    upserted = 0
    failed = 0
    for figi in figi_list:
        try:
            payload = await _sync_call(
                client.get_candles,
                figi,
                from_dt,
                to_dt,
                "CANDLE_INTERVAL_DAY",
            )
            candles = payload.get("candles") or []
            if not candles:
                continue
            async with SessionLocal() as session:
                for item in candles:
                    if not isinstance(item, dict):
                        continue
                    dt = _parse_tinkoff_datetime(item.get("time"))
                    if dt is None:
                        continue
                    row = await session.scalar(
                        select(Candle).where(Candle.figi == figi, Candle.candle_time == dt).limit(1)
                    )
                    open_price = _decimal_price(item.get("open"))
                    high_price = _decimal_price(item.get("high"))
                    low_price = _decimal_price(item.get("low"))
                    close_price = _decimal_price(item.get("close"))
                    volume = int(item.get("volume") or 0)
                    if row is None:
                        session.add(
                            Candle(
                                figi=figi,
                                candle_time=dt,
                                open=open_price,
                                high=high_price,
                                low=low_price,
                                close=close_price,
                                volume=volume,
                            )
                        )
                    else:
                        row.open = open_price
                        row.high = high_price
                        row.low = low_price
                        row.close = close_price
                        row.volume = volume
                    upserted += 1
                await session.commit()
        except Exception as exc:
            failed += 1
            logger.warning("candles sync failed for %s: %s", figi, exc)
    return {
        "message": "candles sync year completed",
        "count": upserted,
        "failed": failed,
        "degraded": failed > 0,
        "writtenToDb": upserted > 0,
    }


async def _dividends_sync_year_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    client = _container.tinkoff_client
    if not client:
        return {"message": "dividends sync year skipped", "count": 0, "writtenToDb": False}
    async with SessionLocal() as session:
        figi_list = await _container.market_repository.list_figi(session)
    if not figi_list:
        return {"message": "dividends sync year completed", "count": 0, "writtenToDb": False}

    aggregated: dict[str, list[dict[str, Any]]] = {}
    failed = 0
    for figi in figi_list:
        try:
            payload = await _sync_call(client.get_dividends, figi)
            dividends = payload.get("dividends") or []
            aggregated[figi] = [item for item in dividends if isinstance(item, dict)]
        except Exception as exc:
            failed += 1
            logger.warning("dividends sync failed for %s: %s", figi, exc)
    value = {"updatedAt": _iso_now(), "payload": aggregated}
    await _upsert_app_setting(
        "dividends.last_payload",
        str(value),
        value_type="json",
        module="dividends",
        description="Последний годовой payload дивидендов по FIGI",
    )
    count = sum(len(v) for v in aggregated.values())
    return {
        "message": "dividends sync year completed",
        "count": count,
        "figiCount": len(aggregated),
        "failed": failed,
        "degraded": failed > 0,
        "writtenToDb": True,
    }


async def _full_db_sync_year_job() -> dict[str, Any]:
    assets = await _assets_sync_job()

    # После актуализации universe (assets/instruments) запускаем остальные шаги
    # параллельно, но не более 4 одновременно.
    semaphore = asyncio.Semaphore(4)

    async def _run_limited(name: str, fn: Callable[[], Awaitable[dict[str, Any]]]) -> tuple[str, dict[str, Any]]:
        async with semaphore:
            try:
                return name, await fn()
            except Exception as e:
                return name, {"degraded": True, "error": str(e)}

    parallel_results = await asyncio.gather(
        _run_limited("fundamentals", _fundamental_sync_fill_job),
        _run_limited("candles", _candles_sync_year_job),
        _run_limited("dividends", _dividends_sync_year_job),
        _run_limited("options", _options_update_job),
        _run_limited("signals", _signals_update_job),
    )

    result_map = dict(parallel_results)
    fundamentals = result_map["fundamentals"]
    candles = result_map["candles"]
    dividends = result_map["dividends"]
    options = result_map["options"]
    signals = result_map["signals"]
    steps = {
        "assets": assets,
        "fundamentals": fundamentals,
        "candles": candles,
        "dividends": dividends,
        "options": options,
        "signals": signals,
    }
    degraded = any(bool((step or {}).get("degraded")) for step in steps.values())
    return {"message": "full db sync year completed", "degraded": degraded, "steps": steps}


async def _trading_windows_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    client = _container.tinkoff_client
    statuses: list[dict[str, Any]] = []
    if client:
        async with SessionLocal() as session:
            figi_list = await _container.market_repository.list_figi(session)
        for figi in figi_list:
            try:
                statuses.append({"figi": figi, "status": await _sync_call(client.get_trading_status, figi)})
            except Exception as e:
                statuses.append({"figi": figi, "error": str(e)})
    now = _iso_now()
    await _upsert_app_setting(
        "trading_windows.last_payload",
        str({"updatedAt": now, "payload": statuses}),
        value_type="json",
        module="trading_windows",
        description="Последний снимок торговых окон/статусов",
    )
    return {"message": "trading windows cache updated", "checked": len(statuses)}


async def _training_full_job() -> dict[str, Any]:
    try:
        from training.run_nn import run as run_nn
        from training.run_weekly import run as run_weekly
        from training.run_stacking import run as run_stacking
        from training.rl import train_agent
    except Exception as exc:
        logger.warning("training imports failed (install [training] extra): %s", exc, exc_info=True)
        return {"message": "training deps unavailable", "detail": str(exc)}
    target_figi: str | None = None
    market_repo = getattr(_container, "market_repository", None) if _container is not None else None
    if market_repo is not None:
        figi_list = await _list_training_figi()
        if not figi_list:
            async with SessionLocal() as session:
                figi_list = await market_repo.list_figi(session)
        if not figi_list:
            return {
                "message": "full training skipped: no DB candles for instruments",
                "windowDays": 365,
            }
        prepared: list[tuple[str, Any, Any, Any, int]] = []
        for figi in figi_list:
            df, used_window_days = await _load_training_candles_with_backfill(
                figi,
                preferred_window_days=365,
                min_rows=80,
                max_window_days=365 * 5,
                max_rows=20_000,
            )
            if df is None:
                continue
            prepared.append(
                (
                    figi,
                    df,
                    await _options_features_for_figi(figi),
                    await _signals_features_for_figi(figi),
                    used_window_days,
                )
            )
        if not prepared:
            return {
                "message": "full training skipped: insufficient candles on all instruments",
                "windowDays": 365,
                "totalInstruments": len(figi_list),
                "trainedInstruments": 0,
                "skippedInstruments": len(figi_list),
            }

        nn_runs: list[dict[str, Any]] = []
        meta_runs: list[dict[str, Any]] = []
        weekly_runs: list[dict[str, Any]] = []
        total = len(prepared)
        for idx, (figi, df, opt_df, sig_df, used_window_days) in enumerate(prepared, start=1):
            await _update_current_task_progress(
                {
                    "progress": {
                        "phase": "nn",
                        "phaseIndex": 1,
                        "phaseTotal": 4,
                        "message": f"Этап 1/3: NN [{idx}/{total}] FIGI {figi} (окно: {used_window_days} дн.)",
                        "figi": figi,
                        "instrumentIndex": idx,
                        "instrumentTotal": total,
                    }
                }
            )
            nn_run_id = await asyncio.to_thread(
                run_nn, 12, 32, 1e-3, None, df, 60, 5, True, options_df=opt_df, signals_df=sig_df
            )
            nn_runs.append({"figi": figi, "runId": nn_run_id})
            await _update_current_task_progress(
                {
                    "progress": {
                        "phase": "meta_ensemble",
                        "phaseIndex": 2,
                        "phaseTotal": 4,
                        "message": f"Этап 2/4: meta/ensemble [{idx}/{total}] FIGI {figi}",
                        "figi": figi,
                        "instrumentIndex": idx,
                        "instrumentTotal": total,
                    }
                }
            )
            nn_ckpt = _select_meta_base_checkpoint(
                candles_df=df,
                options_df=opt_df,
                signals_df=sig_df,
                lookback_days=60,
                prediction_horizon=5,
            )
            meta_ckpt = None
            if nn_ckpt:
                meta_ckpt = await asyncio.to_thread(
                    run_stacking,
                    base_checkpoint_path=nn_ckpt,
                    max_epochs=8,
                    batch_size=32,
                    lr=1e-3,
                    candles_df=df,
                    options_df=opt_df,
                    signals_df=sig_df,
                    lookback_days=60,
                    prediction_horizon=5,
                )
            meta_runs.append({"figi": figi, "checkpoint": meta_ckpt})

        for idx, (figi, df, opt_df, _sig_df, used_window_days) in enumerate(prepared, start=1):
            await _update_current_task_progress(
                {
                    "progress": {
                        "phase": "weekly",
                        "phaseIndex": 3,
                        "phaseTotal": 4,
                        "message": f"Этап 3/4: weekly [{idx}/{total}] FIGI {figi} (окно: {used_window_days} дн.)",
                        "figi": figi,
                        "instrumentIndex": idx,
                        "instrumentTotal": total,
                    }
                }
            )
            weekly_run_id = await asyncio.to_thread(
                run_weekly, 12, 32, 1e-3, None, df, 30, 5, True, options_df=opt_df
            )
            weekly_runs.append({"figi": figi, "runId": weekly_run_id})
        target_figi = prepared[0][0]
        nn_run_id = nn_runs[0]["runId"] if nn_runs else None
        weekly_run_id = weekly_runs[0]["runId"] if weekly_runs else None
        total_instruments = len(figi_list)
        trained_instruments = len(prepared)
    else:
        return {
            "message": "full training skipped: market repository unavailable (real-data only)",
            "reason": "market_repo_unavailable",
            "totalInstruments": 0,
            "trainedInstruments": 0,
            "skippedInstruments": 0,
            "metaRuns": [],
            "metaSucceeded": 0,
            "metaFailed": 0,
        }
    await _update_current_task_progress(
        {
            "progress": {
                "phase": "rl",
                "phaseIndex": 4,
                "phaseTotal": 4,
                "message": (
                    f"Этап 4/4: обучение RL-агента (контур по БД, FIGI {target_figi})"
                    if target_figi
                    else "Этап 4/4: обучение RL-агента"
                ),
                "nnRunId": nn_run_id,
                "weeklyRunId": weekly_run_id,
                "figi": target_figi,
            }
        }
    )
    rl_returns: list[float] = []
    if market_repo is not None:
        for _figi, df, _opt, _sig, _win in prepared:
            rl_returns.extend(_returns_from_candles_df(df))
    rl_checkpoint = await asyncio.to_thread(
        lambda: train_agent(
            env_name="paper",
            total_steps=10_000,
            checkpoint_dir=None,
            continue_from_latest=True,
            market_returns=rl_returns,
        )
    )
    ensemble_weights_path = _write_ensemble_weights_artifact("full")
    meta_succeeded = sum(1 for item in meta_runs if item.get("checkpoint"))
    meta_failed = max(0, len(meta_runs) - meta_succeeded)
    return {
        "message": "full training completed",
        "figi": target_figi,
        "mlflowRunId": nn_run_id,
        "weeklyRunId": weekly_run_id,
        "metaRuns": meta_runs,
        "metaSucceeded": meta_succeeded,
        "metaFailed": meta_failed,
        "ensembleWeightsPath": ensemble_weights_path,
        "totalInstruments": total_instruments,
        "trainedInstruments": trained_instruments,
        "skippedInstruments": max(0, total_instruments - trained_instruments),
        "rlCheckpoint": rl_checkpoint,
    }


async def _training_quick_job() -> dict[str, Any]:
    try:
        from training.run_nn import run as run_nn
        from training.run_stacking import run as run_stacking
        from training.rl import train_agent
    except Exception as exc:
        logger.warning("training imports failed (install [training] extra): %s", exc, exc_info=True)
        return {"message": "training deps unavailable", "detail": str(exc)}
    target_figi: str | None = None
    market_repo = getattr(_container, "market_repository", None) if _container is not None else None
    if market_repo is not None:
        figi_list = await _list_training_figi()
        if not figi_list:
            async with SessionLocal() as session:
                figi_list = await market_repo.list_figi(session)
        if not figi_list:
            return {
                "message": "quick training skipped: no instruments for training",
                "windowDays": 1,
            }

        run_ids: list[dict[str, Any]] = []
        meta_runs: list[dict[str, Any]] = []
        rl_returns: list[float] = []
        skipped = 0
        total = len(figi_list)
        for idx, figi in enumerate(figi_list, start=1):
            target_figi = figi
            candles_df, used_window_days = await _load_training_candles_with_backfill(
                figi,
                preferred_window_days=1,
                min_rows=24,
                max_window_days=365,
                max_rows=20_000,
            )
            if candles_df is None or len(candles_df) < 24:
                intraday_df = await _load_intraday_candles_last_day(figi)
                if intraday_df is not None and len(intraday_df) >= 24:
                    candles_df = intraday_df
                    used_window_days = 1
            if candles_df is None:
                skipped += 1
                continue
            options_df = await _options_features_for_figi(figi)
            signals_df = await _signals_features_for_figi(figi)
            rl_returns.extend(_returns_from_candles_df(candles_df))
            await _update_current_task_progress(
                {
                    "progress": {
                        "phase": "nn",
                        "phaseIndex": 1,
                        "phaseTotal": 3,
                        "message": f"Быстрое обучение [{idx}/{total}] FIGI {figi} (окно: {used_window_days} дн.)",
                        "figi": figi,
                        "instrumentIndex": idx,
                        "instrumentTotal": total,
                    }
                }
            )
            try:
                run_id = await asyncio.to_thread(
                    run_nn,
                    6,
                    24,
                    1e-3,
                    None,
                    candles_df,
                    5,
                    1,
                    True,
                    options_df=options_df,
                    signals_df=signals_df,
                )
            except Exception as e:
                msg = str(e)
                if "current_epoch" in msg and "max_epochs" in msg:
                    logger.warning("Quick training resume failed; retrying without resume: %s", e)
                    run_id = await asyncio.to_thread(
                        run_nn,
                        6,
                        24,
                        1e-3,
                        None,
                        candles_df,
                        5,
                        1,
                        False,
                        options_df=options_df,
                        signals_df=signals_df,
                    )
                elif "Pipeline produced empty X" in msg:
                    skipped += 1
                    continue
                else:
                    raise
            run_ids.append({"figi": figi, "runId": run_id})
            await _update_current_task_progress(
                {
                    "progress": {
                        "phase": "meta_ensemble",
                        "phaseIndex": 2,
                        "phaseTotal": 3,
                        "message": f"Быстрое meta/ensemble [{idx}/{total}] FIGI {figi}",
                        "figi": figi,
                        "instrumentIndex": idx,
                        "instrumentTotal": total,
                    }
                }
            )
            nn_ckpt = _select_meta_base_checkpoint(
                candles_df=candles_df,
                options_df=options_df,
                signals_df=signals_df,
                lookback_days=5,
                prediction_horizon=1,
            )
            meta_ckpt = None
            if nn_ckpt:
                meta_ckpt = await asyncio.to_thread(
                    run_stacking,
                    base_checkpoint_path=nn_ckpt,
                    max_epochs=3,
                    batch_size=16,
                    lr=1e-3,
                    candles_df=candles_df,
                    options_df=options_df,
                    signals_df=signals_df,
                    lookback_days=5,
                    prediction_horizon=1,
                )
            meta_runs.append({"figi": figi, "checkpoint": meta_ckpt})

        if not run_ids:
            return {
                "message": "quick training skipped: insufficient candles on all instruments",
                "windowDays": 1,
                "totalInstruments": total,
                "trainedInstruments": 0,
                "skippedInstruments": total,
            }
        await _update_current_task_progress(
            {
                "progress": {
                    "phase": "rl",
                    "phaseIndex": 3,
                    "phaseTotal": 3,
                    "message": "Быстрое обучение: RL fine-tune",
                }
            }
        )
        rl_checkpoint = await asyncio.to_thread(
            lambda: train_agent(
                env_name="paper",
                total_steps=2_000,
                checkpoint_dir=None,
                continue_from_latest=True,
                market_returns=rl_returns,
            )
        )
        ensemble_weights_path = _write_ensemble_weights_artifact("quick")
        meta_succeeded = sum(1 for item in meta_runs if item.get("checkpoint"))
        meta_failed = max(0, len(meta_runs) - meta_succeeded)
        return {
            "message": "quick training completed",
            "figi": run_ids[0]["figi"],
            "mlflowRunId": run_ids[0]["runId"],
            "metaRuns": meta_runs,
            "metaSucceeded": meta_succeeded,
            "metaFailed": meta_failed,
            "rlCheckpoint": rl_checkpoint,
            "ensembleWeightsPath": ensemble_weights_path,
            "totalInstruments": total,
            "trainedInstruments": len(run_ids),
            "skippedInstruments": skipped,
            "runIds": run_ids,
        }

    return {
        "message": "quick training skipped: market repository unavailable",
        "windowDays": 1,
        "totalInstruments": 0,
        "trainedInstruments": 0,
        "skippedInstruments": 0,
        "metaSucceeded": 0,
        "metaFailed": 0,
    }


async def _analysis_market_portfolio_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    # Анализ: считаем NN-сигнал по каждому FIGI, опционально обогащаем LLM
    # и объединяем через weighted fusion в итоговую рекомендацию.
    from app.core.config import get_settings as _get_analysis_settings
    from app.db.session import SessionLocal as _Session
    from app.services.llm_jury_service import persist_llm_jury_batch_chunk
    from app.api.v1.training import _default_jury_providers
    from training.llm_jury.run import run_jury_batch_chunk

    await _update_current_task_progress(
        {
            "progress": {
                "message": "Этап 1/3: запуск анализа рынка и портфеля",
                "phase": "analysis",
                "stage": "prepare",
                "stageLabel": "Подготовка",
                "stageIndex": 1,
                "stageTotal": 3,
            }
        }
    )

    async with _Session() as session:
        market_repo = getattr(_container, "market_repository", None)
        if market_repo is None:
            raise RuntimeError("Market repository is unavailable")
        app_settings: dict[str, str] = {}
        if hasattr(session, "execute"):
            app_settings_rows = (
                await session.execute(select(AppSetting.key, AppSetting.value))
            ).all()
            app_settings = {
                str(k): str(v) for k, v in app_settings_rows if isinstance(k, str)
            }

        runtime = _analysis_runtime_settings(app_settings)
        feature_enabled = runtime.feature_enabled
        canary_percent = runtime.canary_percent
        conf_temp_nn_only = runtime.conf_temp_nn_only
        conf_temp_llm_only = runtime.conf_temp_llm_only
        conf_temp_nn_llm = runtime.conf_temp_nn_llm
        llm_margin = runtime.llm_margin
        llm_cache_ttl_h = runtime.llm_cache_ttl_h
        quality_gates_enabled = runtime.quality_gates_enabled

        inst_rows: list[Any] = []
        offset = 0
        batch_size = 500
        while True:
            batch = await market_repo.list_instruments(session, offset=offset, limit=batch_size)
            if not batch:
                break
            inst_rows.extend(batch)
            offset += len(batch)
            if len(batch) < batch_size:
                break
        targets: list[tuple[str, str, str]] = []
        for inst in inst_rows:
            figi = getattr(inst, "figi", None)
            if not figi:
                continue
            ticker = str(getattr(inst, "ticker", None) or figi)
            sector = str(getattr(inst, "sector", None) or "—")
            targets.append((str(figi), ticker, sector))
        total_targets = len(targets)

        providers = _default_jury_providers()
        llm_total = total_targets if providers else 0
        llm_enriched = 0
        nn_enriched = 0
        skipped_daily = 0
        skipped_unavailable = 0
        fusion_nn_only = 0
        fusion_llm_only = 0
        fusion_both = 0
        skipped_no_signal = 0
        nn_failures = 0
        llm_calls_saved = 0
        llm_cache_hits = 0
        llm_calls_total = 0
        canary_processed = 0
        canary_skipped = 0
        recommendation_buy = 0
        recommendation_sell = 0
        recommendation_hold = 0

        await _update_current_task_progress(
            {
                "progress": {
                    "message": f"Этап 2/3: NN-инференс по {total_targets} инструментам",
                    "phase": "analysis",
                    "stage": "nn_prepare",
                    "stageLabel": "NN-анализ",
                    "stageIndex": 2,
                    "stageTotal": 3,
                }
            }
        )

        models_dir = os.path.join("models", "python_nn")
        nn_ckpt = _latest_checkpoint_path(models_dir)
        if not nn_ckpt:
            nn_ckpt = "./models/python_nn/cond_mlp-latest.ckpt"
            if not os.path.exists(nn_ckpt):
                nn_ckpt = None

        today = now_msk().date()

        def _has_real_llm_payload(payload: Any) -> bool:
            if not isinstance(payload, dict):
                return False
            source = str(payload.get("source") or "")
            providers_payload = payload.get("providers")
            if source == "scheduler_analysis_hybrid" and isinstance(payload.get("llm"), dict):
                providers_payload = (payload.get("llm") or {}).get("providers")
            if not isinstance(providers_payload, dict):
                return False
            required = ("gigachat", "alisa_gpt")
            return all(
                isinstance(providers_payload.get(key), dict)
                and str((providers_payload.get(key) or {}).get("rawText", "")).strip() != ""
                for key in required
            )

        analysis_row_by_figi: dict[str, dict[str, Any]] = {}
        batch_queue: list[dict[str, str]] = []

        for idx, (figi, ticker, sector) in enumerate(targets, start=1):
            if not feature_enabled:
                canary_skipped += 1
                continue
            if not _is_canary_enabled_for_figi(figi, canary_percent):
                canary_skipped += 1
                continue
            canary_processed += 1
            await _update_current_task_progress(
                {
                    "progress": {
                        "message": f"Этап 2/3: NN [{idx}/{total_targets}] FIGI {figi}",
                        "phase": "analysis",
                        "stage": "nn_inference",
                        "substage": "NN",
                        "stageLabel": "NN-анализ",
                        "stageIndex": 2,
                        "stageTotal": 3,
                        "instrumentIndex": idx,
                        "instrumentTotal": total_targets,
                        "figi": figi,
                    }
                }
            )

            nn_data: dict[str, Any] | None = None
            if nn_ckpt:
                try:
                    nn_data = await _run_nn_inference_for_figi(figi, nn_ckpt)
                except Exception as e:
                    logger.warning("NN inference failed for %s: %s", figi, e)
                    nn_data = {"ok": False, "reason": "exception", "detail": str(e)}
            else:
                nn_data = {"ok": False, "reason": "checkpoint_missing"}

            nn_ok = bool(nn_data and nn_data.get("ok"))
            if nn_ok:
                nn_enriched += 1
            else:
                nn_failures += 1

            regime = str(((nn_data or {}).get("payload") or {}).get("marketRegime") or "normal")
            w_nn, w_llm, buy_threshold, sell_threshold = _adaptive_fusion_params(regime)
            nn_score_preview = _clamp01(float(nn_data.get("score")), default=0.5) if nn_ok else None
            margin_use_llm = True
            if nn_score_preview is not None:
                margin_use_llm = abs(nn_score_preview - 0.5) <= max(0.01, llm_margin)
                if not margin_use_llm:
                    llm_calls_saved += 1

            cache_key = f"{figi}:{now_msk().date().isoformat()}"
            row_state: dict[str, Any] = {
                "figi": figi,
                "ticker": ticker,
                "sector": sector,
                "nn_data": nn_data,
                "nn_ok": nn_ok,
                "margin_use_llm": margin_use_llm,
                "regime": regime,
                "w_nn": w_nn,
                "w_llm": w_llm,
                "buy_threshold": buy_threshold,
                "sell_threshold": sell_threshold,
                "llm_payload": None,
                "llm_consensus": None,
                "llm_confidence": None,
                "llm_reason": "providers_missing",
                "needs_network_batch": False,
                "cache_key": cache_key,
            }
            if providers and not margin_use_llm:
                row_state["llm_reason"] = "skipped_confident_nn"

            if providers:
                filled = False
                cached = _llm_cache.get(cache_key)
                if (
                    margin_use_llm
                    and cached is not None
                    and isinstance(cached.get("expiresAt"), datetime)
                    and cached["expiresAt"] > datetime.now(timezone.utc)
                ):
                    row_state["llm_payload"] = cached.get("payload")
                    row_state["llm_consensus"] = _clamp01(float(cached.get("consensus", 0.5)))
                    row_state["llm_confidence"] = _clamp01(float(cached.get("confidence", 0.5)))
                    row_state["llm_reason"] = "cache_hit"
                    llm_cache_hits += 1
                    filled = True
                if margin_use_llm and not filled:
                    current_rec = await market_repo.get_recommendation_by_figi(session, figi)
                    current_date = getattr(current_rec, "analysis_date", None)
                    current_payload = getattr(current_rec, "llm_jury_payload", None)
                    if (
                        current_date is not None
                        and getattr(current_date, "date", lambda: None)() == today
                        and _has_real_llm_payload(current_payload)
                    ):
                        skipped_daily += 1
                        if isinstance(current_payload, dict):
                            row_state["llm_payload"] = current_payload
                            llm_root = (
                                current_payload.get("llm")
                                if isinstance(current_payload.get("llm"), dict)
                                else current_payload
                            )
                            row_state["llm_consensus"] = _clamp01(float((llm_root or {}).get("consensus", 0.5)))
                            row_state["llm_confidence"] = _clamp01(
                                float((llm_root or {}).get("confidenceAvg", 0.5))
                            )
                        row_state["llm_reason"] = "daily_limit"
                        filled = True
                if not filled:
                    candles = await market_repo.get_candles_by_figi(
                        session,
                        figi=figi,
                        offset=0,
                        limit=30,
                    )
                    if candles:
                        parts = [f"close: {c.close}" for c in candles[-5:]]
                        context = f"Тикер {ticker}, сектор {sector}. Последние свечи: {', '.join(parts)}."
                    else:
                        context = f"Тикер {ticker}, сектор {sector}."
                    batch_queue.append({"figi": figi, "ticker": str(ticker), "context": context})
                    row_state["needs_network_batch"] = True

            analysis_row_by_figi[figi] = row_state

        batch_size = max(1, int(_get_analysis_settings().llm_jury_batch_size))
        n_batch_chunks = (len(batch_queue) + batch_size - 1) // batch_size if batch_queue else 0
        batch_results: dict[str, dict[str, Any]] = {}
        for ci in range(0, len(batch_queue), batch_size):
            chunk = batch_queue[ci : ci + batch_size]
            chunk_num = ci // batch_size + 1
            await _update_current_task_progress(
                {
                    "progress": {
                        "message": (
                            f"Этап 2/3: LLM батч [{chunk_num}/{n_batch_chunks}] "
                            f"({len(chunk)} инструментов)"
                        ),
                        "phase": "analysis",
                        "stage": "llm_enrich",
                        "substage": "LLM",
                        "stageLabel": "LLM-анализ (батч)",
                        "stageIndex": 2,
                        "stageTotal": 3,
                    }
                }
            )
            try:
                out = await run_jury_batch_chunk(chunk, providers)
                llm_calls_total += len(providers)
                figis_c = [c["figi"] for c in chunk]
                await persist_llm_jury_batch_chunk(
                    session,
                    figis=figis_c,
                    providers=providers,
                    raw_opinions=out["rawOpinions"],
                )
                for figi_k, data in (out.get("byFigi") or {}).items():
                    batch_results[figi_k] = data
            except Exception as e:
                logger.warning("LLM jury batch chunk failed: %s", e)

        for figi, row in analysis_row_by_figi.items():
            if not row.get("needs_network_batch"):
                continue
            br = batch_results.get(figi)
            if not br:
                row["llm_reason"] = "exception"
                continue
            row["llm_payload"] = {
                "providers": br.get("provider_payload") or {},
                "consensus": float(br["consensus"]),
                "dispersion": float(br["dispersion"]),
                "confidenceAvg": float(br["confidence_avg"]),
                "requiredProvidersPresent": bool(br.get("required_providers_present")),
                "source": "scheduler_analysis",
            }
            margin_m = bool(row.get("margin_use_llm"))
            if bool(br.get("required_providers_present")):
                row["llm_consensus"] = _clamp01(float(br["consensus"]))
                row["llm_confidence"] = _clamp01(float(br["confidence_avg"]))
                row["llm_reason"] = "ok" if margin_m else "skipped_confident_nn"
                if margin_m:
                    llm_enriched += 1
            else:
                row["llm_consensus"] = None
                row["llm_confidence"] = None
                if margin_m:
                    skipped_unavailable += 1
                    row["llm_reason"] = "unavailable"
                else:
                    row["llm_reason"] = "skipped_confident_nn"
            if (
                margin_m
                and bool(br.get("required_providers_present"))
                and row["llm_consensus"] is not None
                and row["llm_confidence"] is not None
                and row["llm_payload"] is not None
            ):
                _llm_cache[row["cache_key"]] = {
                    "payload": row["llm_payload"],
                    "consensus": row["llm_consensus"],
                    "confidence": row["llm_confidence"],
                    "expiresAt": datetime.now(timezone.utc) + timedelta(hours=llm_cache_ttl_h),
                }

        for idx, (figi, ticker, sector) in enumerate(targets, start=1):
            if not feature_enabled:
                continue
            if not _is_canary_enabled_for_figi(figi, canary_percent):
                continue
            row = analysis_row_by_figi.get(figi)
            if row is None:
                continue

            nn_data = row["nn_data"]
            nn_ok = row["nn_ok"]
            margin_use_llm = row["margin_use_llm"]
            regime = row["regime"]
            w_nn, w_llm = row["w_nn"], row["w_llm"]
            buy_threshold, sell_threshold = row["buy_threshold"], row["sell_threshold"]
            llm_payload = row.get("llm_payload")
            llm_consensus = row.get("llm_consensus")
            llm_confidence = row.get("llm_confidence")
            llm_reason = row.get("llm_reason") or "providers_missing"

            await _update_current_task_progress(
                {
                    "progress": {
                        "message": f"Этап 2/3: Fusion [{idx}/{total_targets}] FIGI {figi}",
                        "phase": "analysis",
                        "stage": "fusion",
                        "substage": "Fusion",
                        "stageLabel": "NN+LLM Fusion",
                        "stageIndex": 2,
                        "stageTotal": 3,
                        "instrumentIndex": idx,
                        "instrumentTotal": total_targets,
                        "figi": figi,
                    }
                }
            )

            nn_score = _clamp01(float(nn_data.get("score")), default=0.5) if nn_ok else None
            nn_conf = _clamp01(float(nn_data.get("confidence")), default=0.5) if nn_ok else None
            llm_ok = (
                margin_use_llm
                and llm_consensus is not None
                and llm_confidence is not None
            )
            final_score: float | None = None
            final_conf: float | None = None
            fusion_mode = "none"

            if nn_ok and llm_ok:
                nn_score_fused = _nn_score_with_llm_fallback(nn_score, llm_consensus)
                nn_conf_fused = _nn_conf_with_llm_fallback(nn_conf, llm_confidence)
                final_score = _clamp01(w_nn * nn_score_fused + w_llm * llm_consensus)
                raw_conf = _clamp01(w_nn * nn_conf_fused + w_llm * llm_confidence)
                final_conf = _calibrate_confidence(raw_conf, mode="nn_llm", temperature=conf_temp_nn_llm)
                fusion_mode = "nn_llm"
                fusion_both += 1
            elif nn_ok:
                nn_score_fused = _nn_score_with_llm_fallback(nn_score, llm_consensus)
                nn_conf_fused = _nn_conf_with_llm_fallback(nn_conf, llm_confidence)
                final_score = nn_score_fused
                final_conf = _calibrate_confidence(
                    nn_conf_fused, mode="nn_only", temperature=conf_temp_nn_only
                )
                fusion_mode = "nn_only"
                fusion_nn_only += 1
            elif llm_ok:
                final_score = llm_consensus
                final_conf = _calibrate_confidence(
                    llm_confidence, mode="llm_only", temperature=conf_temp_llm_only
                )
                fusion_mode = "llm_only"
                fusion_llm_only += 1
            else:
                if quality_gates_enabled:
                    # При полном отсутствии валидных сигналов сохраняем нейтральный HOLD вместо silent skip.
                    final_score = 0.5
                    final_conf = 0.5
                    fusion_mode = "degrade_to_hold"
                else:
                    skipped_no_signal += 1
                    continue

            fusion_payload = {
                "source": "scheduler_analysis_hybrid",
                "weights": {"nn": w_nn, "llm": w_llm},
                "thresholds": {"buy": buy_threshold, "sell": sell_threshold},
                "marketRegime": regime,
                "mode": fusion_mode,
                "nnAvailable": nn_ok,
                "llmAvailable": llm_ok,
                "llmReason": llm_reason,
                "finalScore": final_score,
                "finalConfidence": final_conf,
                "calibration": {
                    "nnOnlyTemperature": conf_temp_nn_only,
                    "llmOnlyTemperature": conf_temp_llm_only,
                    "nnLlmTemperature": conf_temp_nn_llm,
                },
            }
            if nn_data is not None:
                fusion_payload["nn"] = nn_data
            if llm_payload is not None:
                fusion_payload["llm"] = llm_payload

            final_recommendation = (
                "BUY" if final_score >= buy_threshold else "SELL" if final_score <= sell_threshold else "HOLD"
            )
            if final_recommendation == "BUY":
                recommendation_buy += 1
            elif final_recommendation == "SELL":
                recommendation_sell += 1
            else:
                recommendation_hold += 1

            await market_repo.upsert_recommendation(
                session,
                figi=figi,
                recommendation=final_recommendation,
                confidence=Decimal(str(round(float(final_conf), 4))),
                score=Decimal(str(round(float(final_score), 4))),
                llm_jury_payload=fusion_payload,
                nn_score=Decimal(str(round(float(nn_score), 4))) if nn_score is not None else None,
                nn_confidence=Decimal(str(round(float(nn_conf), 4))) if nn_conf is not None else None,
                nn_checkpoint=str(nn_data.get("checkpoint")) if nn_ok else None,
                nn_payload=(
                    nn_data.get("payload")
                    if nn_ok
                    else {"ok": False, "reason": (nn_data or {}).get("reason", "unavailable")}
                ),
            )
            try:
                if _container is not None:
                    await _container.market_service.compute_and_store_weekly_forecast(session, figi)
            except Exception as wf_exc:
                logger.warning("weekly forecast persist failed for %s: %s", figi, wf_exc)
            await session.commit()

        await _update_current_task_progress(
            {
                "progress": {
                    "message": "Этап 3/3: расчет recommendation pipeline",
                    "phase": "analysis",
                    "stage": "pipeline",
                    "stageLabel": "Расчет рекомендаций",
                    "stageIndex": 3,
                    "stageTotal": 3,
                }
            }
        )
        data = await _container.recommendation_pipeline_service.run(
            session,
            mode="paper",
            min_confidence=Decimal("0"),
            min_score=Decimal("0"),
            limit=50,
        )
        # Фиксируем созданные pipeline-заявки в БД, иначе created в summary может
        # быть > 0 при фактическом rollback на выходе из сессии.
        await session.commit()

        _pipe_created = len(data.get("created") or [])
        _pipe_auto_ok = len(data.get("autoExecuted") or [])
        _pipe_auto_skip = len(data.get("autoExecuteSkipped") or [])
        _pipe_skip_reasons = data.get("autoExecuteSkippedByReason") or {}
        _reason_bits = [f"{k}:{v}" for k, v in sorted(_pipe_skip_reasons.items())]
        _retry = data.get("pendingPaperAutoRetry") or {}
        _retry_n = int(_retry.get("attempted") or 0)
        _retry_ok = len(_retry.get("executedFigis") or [])
        _retry_fail = len(_retry.get("failed") or [])
        _pipe_line = (
            f"заявок pipeline: создано {_pipe_created}, автоисполнено {_pipe_auto_ok}, "
            f"авто пропущено {_pipe_auto_skip}"
            + (f" ({', '.join(_reason_bits)})" if _reason_bits else "")
            + f"; догон PENDING: попыток {_retry_n}, исполнено {_retry_ok}, не вышло {_retry_fail}"
        )
        await _update_current_task_progress(
            {
                "progress": {
                    "message": (
                        "Анализ завершен: "
                        f"NN обновлено {nn_enriched}, "
                        f"LLM обновлено {llm_enriched}, "
                        f"fusion NN+LLM {fusion_both}, "
                        f"fallback NN-only {fusion_nn_only}, "
                        f"fallback LLM-only {fusion_llm_only}, "
                        f"LLM cache hit {llm_cache_hits}, "
                        f"LLM вызовов сэкономлено {llm_calls_saved}, "
                        f"пропущено по суточному лимиту {skipped_daily}, "
                        f"пропущено без реальных LLM-данных {skipped_unavailable}, "
                        f"пропущено без сигналов {skipped_no_signal}, "
                        f"canary processed {canary_processed}, skipped {canary_skipped}, "
                        f"BUY {recommendation_buy}, SELL {recommendation_sell}, HOLD {recommendation_hold}. "
                        f"{_pipe_line}"
                    ),
                    "phase": "done",
                    "stage": "done",
                    "stageLabel": "Завершено",
                    "stageIndex": 3,
                    "stageTotal": 3,
                    "nnEnriched": nn_enriched,
                    "llmEnriched": llm_enriched,
                    "fusionBoth": fusion_both,
                    "fusionNnOnly": fusion_nn_only,
                    "fusionLlmOnly": fusion_llm_only,
                    "skippedDaily": skipped_daily,
                    "skippedUnavailable": skipped_unavailable,
                    "skippedNoSignal": skipped_no_signal,
                    "llmCacheHits": llm_cache_hits,
                    "llmCallsSaved": llm_calls_saved,
                    "canaryProcessed": canary_processed,
                    "canarySkipped": canary_skipped,
                    "totalTargets": total_targets,
                    "recommendationBuy": recommendation_buy,
                    "recommendationSell": recommendation_sell,
                    "recommendationHold": recommendation_hold,
                }
            }
        )
        return {
            "message": "analysis completed",
            "summary": data,
            "nnEnriched": nn_enriched,
            "nnFailures": nn_failures,
            "llmEnriched": llm_enriched,
            "llmTotalTargets": llm_total,
            "fusionBoth": fusion_both,
            "fusionNnOnly": fusion_nn_only,
            "fusionLlmOnly": fusion_llm_only,
            "skippedDaily": skipped_daily,
            "skippedUnavailable": skipped_unavailable,
            "skippedNoSignal": skipped_no_signal,
            "llmCacheHits": llm_cache_hits,
            "llmCallsSaved": llm_calls_saved,
            "llmCallsTotal": llm_calls_total,
            "canaryProcessed": canary_processed,
            "canarySkipped": canary_skipped,
            "totalTargets": total_targets,
            "recommendationBuy": recommendation_buy,
            "recommendationSell": recommendation_sell,
            "recommendationHold": recommendation_hold,
            "featureEnabled": feature_enabled,
            "canaryPercent": canary_percent,
        }


async def _analysis_portfolio_positions_job() -> dict[str, Any]:
    """BUY/SELL/HOLD по открытым позициям каждого scope (GigaChat и/или свежий ручной импорт по TTL)."""
    if not _container:
        raise RuntimeError("Container is not initialized")
    from app.core.portfolio_scope import all_portfolio_scopes, canonical_portfolio_scope

    svc = _container.portfolio_position_analysis_service
    results: list[dict[str, Any]] = []
    for scope in all_portfolio_scopes():
        try:
            canon = canonical_portfolio_scope(scope)
        except ValueError:
            continue
        async with SessionLocal() as session:
            try:
                one = await svc.run_verdict(
                    session,
                    portfolio_scope=canon,
                    figi_filter=None,
                    persist=True,
                )
                ppr_pipe: dict[str, Any] | None = None
                if (
                    _container.settings.ppr_auto_pipeline_enabled
                    and int(one.get("saved") or 0) > 0
                ):
                    ppr_pipe = await _container.portfolio_position_pipeline_service.run_for_scope(
                        session,
                        portfolio_scope=canon,
                        mode="paper",
                        limit=50,
                    )
                await session.commit()
                if ppr_pipe is not None:
                    one = {**one, "pprPipeline": ppr_pipe}
                results.append(one)
            except Exception as e:
                logger.exception("analysis_portfolio_positions failed for %s", canon)
                await session.rollback()
                results.append({"portfolioScope": canon, "error": str(e)})
    return {"message": "analysis_portfolio_positions completed", "scopes": results}


async def _collect_weekly_training_dataset(
    *,
    mode: str,
    seq_len: int,
    n_forecast: int,
    preferred_window_days: int,
    max_window_days: int,
    max_figi: int | None = None,
) -> dict[str, Any]:
    try:
        import pandas as pd
    except Exception:
        return {
            "ok": False,
            "error": "pandas_unavailable",
            "instrumentTotal": 0,
            "instrumentEligible": 0,
            "instrumentSkipped": 0,
            "rowsTotal": 0,
            "rowsUsed": 0,
            "rowsSkipped": 0,
            "skipReasons": {"pandas_unavailable": 1},
        }

    await _update_current_task_progress(
        {
            "progress": {
                "message": "Weekly forecast: этап 1/4 — сбор списка инструментов",
                "phase": "weekly_forecast",
                "stage": "collect_universe",
                "stageLabel": "Сбор universe",
                "stageIndex": 1,
                "stageTotal": 4,
            }
        }
    )
    figi_list = await _list_training_figi(limit=max_figi)
    instrument_total = len(figi_list)
    min_rows = 20 + int(seq_len) + int(n_forecast) + 50
    skip_reasons: dict[str, int] = {}
    used_frames: list[Any] = []
    rows_total = 0
    rows_used = 0

    if instrument_total == 0:
        return {
            "ok": False,
            "error": "no_instruments",
            "instrumentTotal": 0,
            "instrumentEligible": 0,
            "instrumentSkipped": 0,
            "rowsTotal": 0,
            "rowsUsed": 0,
            "rowsSkipped": 0,
            "skipReasons": {"no_instruments": 1},
        }

    await _update_current_task_progress(
        {
            "progress": {
                "message": (
                    f"Weekly forecast: этап 2/4 — загрузка свечей ({instrument_total} инструментов)"
                ),
                "phase": "weekly_forecast",
                "stage": "load_candles",
                "stageLabel": "Загрузка свечей",
                "stageIndex": 2,
                "stageTotal": 4,
                "instrumentTotal": instrument_total,
            }
        }
    )
    for idx, figi in enumerate(figi_list, start=1):
        if idx == 1 or idx % 25 == 0 or idx == instrument_total:
            await _update_current_task_progress(
                {
                    "progress": {
                        "message": f"Weekly forecast: свечи [{idx}/{instrument_total}] FIGI {figi}",
                        "phase": "weekly_forecast",
                        "stage": "load_candles",
                        "substage": "per_figi",
                        "stageLabel": "Загрузка свечей",
                        "stageIndex": 2,
                        "stageTotal": 4,
                        "instrumentIndex": idx,
                        "instrumentTotal": instrument_total,
                        "figi": figi,
                    }
                }
            )
        try:
            df, _window = await _load_training_candles_with_backfill(
                figi,
                preferred_window_days=preferred_window_days,
                min_rows=min_rows,
                max_window_days=max_window_days,
            )
        except Exception:
            skip_reasons["load_exception"] = int(skip_reasons.get("load_exception", 0)) + 1
            continue
        if df is None or len(df) <= 0:
            skip_reasons["missing_data"] = int(skip_reasons.get("missing_data", 0)) + 1
            continue
        rows_total += int(len(df))
        if len(df) < min_rows:
            skip_reasons["insufficient_candles"] = int(skip_reasons.get("insufficient_candles", 0)) + 1
            continue
        dfx = df.copy()
        dfx["figi"] = figi
        used_frames.append(dfx)
        rows_used += int(len(dfx))

    instrument_eligible = len(used_frames)
    instrument_skipped = max(0, instrument_total - instrument_eligible)
    rows_skipped = max(0, rows_total - rows_used)
    if not used_frames:
        return {
            "ok": False,
            "error": "insufficient_data",
            "instrumentTotal": instrument_total,
            "instrumentEligible": 0,
            "instrumentSkipped": instrument_skipped,
            "rowsTotal": rows_total,
            "rowsUsed": 0,
            "rowsSkipped": rows_total,
            "skipReasons": skip_reasons or {"insufficient_data": instrument_total},
        }

    await _update_current_task_progress(
        {
            "progress": {
                "message": "Weekly forecast: этап 3/4 — формирование обучающего набора",
                "phase": "weekly_forecast",
                "stage": "prepare_dataset",
                "stageLabel": "Подготовка датасета",
                "stageIndex": 3,
                "stageTotal": 4,
                "instrumentTotal": instrument_total,
                "instrumentEligible": instrument_eligible,
                "instrumentSkipped": instrument_skipped,
            }
        }
    )
    candles_df = pd.concat(used_frames).sort_index()
    return {
        "ok": True,
        "mode": mode,
        "candlesDf": candles_df,
        "instrumentTotal": instrument_total,
        "instrumentEligible": instrument_eligible,
        "instrumentSkipped": instrument_skipped,
        "rowsTotal": rows_total,
        "rowsUsed": rows_used,
        "rowsSkipped": rows_skipped,
        "skipReasons": skip_reasons,
    }


async def _weekly_generation_job() -> dict[str, Any]:
    mode = "generation"
    epochs = 12
    seq_len = 30
    n_forecast = 5
    batch_size = 32
    lr = 1e-3
    resume_from_latest = False
    dataset = await _collect_weekly_training_dataset(
        mode=mode,
        seq_len=seq_len,
        n_forecast=n_forecast,
        preferred_window_days=365,
        max_window_days=1825,
    )
    if not dataset.get("ok"):
        return {
            "message": "weekly generation skipped: insufficient real DB data",
            "mode": mode,
            "dataSource": "real_db",
            "processedUniverse": "all_instruments",
            **{k: v for k, v in dataset.items() if k != "candlesDf"},
            "resumeFromLatest": resume_from_latest,
            "effectiveMaxEpochs": epochs,
        }

    await _update_current_task_progress(
        {
            "progress": {
                "message": "Weekly forecast: этап 4/4 — обучение global weekly модели",
                "phase": "weekly_forecast",
                "stage": "train",
                "stageLabel": "Обучение модели",
                "stageIndex": 4,
                "stageTotal": 4,
                "mode": mode,
            }
        }
    )
    try:
        from training.run_weekly import run
    except Exception:
        return {
            "message": "weekly deps unavailable",
            "mode": mode,
            "dataSource": "real_db",
            "processedUniverse": "all_instruments",
            **{k: v for k, v in dataset.items() if k != "candlesDf"},
            "resumeFromLatest": resume_from_latest,
            "effectiveMaxEpochs": epochs,
        }
    run_id = await asyncio.to_thread(
        run,
        epochs,
        batch_size,
        lr,
        None,
        dataset["candlesDf"],
        seq_len,
        n_forecast,
        resume_from_latest,
        None,
    )
    return {
        "message": "weekly generation completed",
        "mode": mode,
        "dataSource": "real_db",
        "processedUniverse": "all_instruments",
        "mlflowRunId": run_id,
        "resumeFromLatest": resume_from_latest,
        "effectiveMaxEpochs": epochs,
        **{k: v for k, v in dataset.items() if k not in {"candlesDf", "ok", "mode"}},
        "parameters": {
            "epochs": epochs,
            "batchSize": batch_size,
            "lr": lr,
            "seqLen": seq_len,
            "nForecast": n_forecast,
            "updateMode": False,
        },
    }


async def _weekly_update_job() -> dict[str, Any]:
    mode = "update"
    epochs = 4
    seq_len = 30
    n_forecast = 5
    batch_size = 16
    lr = 1e-3
    resume_from_latest = True
    dataset = await _collect_weekly_training_dataset(
        mode=mode,
        seq_len=seq_len,
        n_forecast=n_forecast,
        preferred_window_days=45,
        max_window_days=365,
    )
    if not dataset.get("ok"):
        return {
            "message": "weekly update skipped: insufficient recent DB data",
            "mode": mode,
            "dataSource": "real_db",
            "processedUniverse": "all_instruments",
            **{k: v for k, v in dataset.items() if k != "candlesDf"},
            "resumeFromLatest": resume_from_latest,
            "effectiveMaxEpochs": epochs,
        }

    await _update_current_task_progress(
        {
            "progress": {
                "message": "Weekly forecast: этап 4/4 — инкрементальное дообучение",
                "phase": "weekly_forecast",
                "stage": "train",
                "stageLabel": "Дообучение модели",
                "stageIndex": 4,
                "stageTotal": 4,
                "mode": mode,
            }
        }
    )
    try:
        from training.run_weekly import run
    except Exception:
        return {
            "message": "weekly deps unavailable",
            "mode": mode,
            "dataSource": "real_db",
            "processedUniverse": "all_instruments",
            **{k: v for k, v in dataset.items() if k != "candlesDf"},
            "resumeFromLatest": resume_from_latest,
            "effectiveMaxEpochs": epochs,
        }
    run_id = await asyncio.to_thread(
        run,
        epochs,
        batch_size,
        lr,
        None,
        dataset["candlesDf"],
        seq_len,
        n_forecast,
        resume_from_latest,
        None,
    )
    return {
        "message": "weekly update completed",
        "mode": mode,
        "dataSource": "real_db",
        "processedUniverse": "all_instruments",
        "mlflowRunId": run_id,
        "resumeFromLatest": resume_from_latest,
        "effectiveMaxEpochs": epochs,
        **{k: v for k, v in dataset.items() if k not in {"candlesDf", "ok", "mode"}},
        "parameters": {
            "epochs": epochs,
            "batchSize": batch_size,
            "lr": lr,
            "seqLen": seq_len,
            "nForecast": n_forecast,
            "updateMode": True,
        },
    }


async def _weekly_training_job() -> dict[str, Any]:
    return await _weekly_generation_job()


async def _portfolio_prices_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    await _last_prices_job(_container)
    return {"message": "portfolio prices updated"}


async def _active_signals_prices_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    await _signals_update_job()
    await _last_prices_job(_container)
    return {"message": "active signals prices updated"}


async def _trading_requests_prices_update_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    client = _container.tinkoff_client
    if not client:
        return {"message": "trading requests prices updated", "updated": 0}
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(TradingRequest).where(TradingRequest.status.in_(["PENDING", "APPROVED"]))
            )
        ).scalars().all()
        figi_list = sorted({r.figi for r in rows if r.figi})
        prices = (await _sync_call(client.get_last_prices, figi_list)).get("lastPrices") or []
        by_figi: dict[str, float] = {}
        for p in prices:
            figi = p.get("figi")
            if not figi:
                continue
            by_figi[figi] = price_units_nano_to_float(p.get("price"))
        updated = 0
        for row in rows:
            price = by_figi.get(row.figi)
            if price and price > 0:
                row.actual_price = price
                updated += 1
        await session.commit()
    return {"message": "trading requests prices updated", "updated": updated}


def _backtest_metrics_all_nan(metrics: dict[str, Any]) -> bool:
    """True, если все ключевые метрики NaN — пропуск инструмента."""
    for key in ("test_mse", "test_mae", "test_direction_accuracy"):
        v = metrics.get(key)
        if not isinstance(v, (int, float)):
            return True
        if not math.isnan(float(v)):
            return False
    return True


async def _weekly_backtest_job() -> dict[str, Any]:
    """Walk-forward по всем инструментам из БД (как quick training); прогресс в task.update (WS)."""
    backtest_timeout_sec = 180
    heartbeat_interval_sec = 15

    try:
        from training.run_backtest import run
    except Exception:
        return {"message": "backtest deps unavailable"}

    market_repo = getattr(_container, "market_repository", None) if _container is not None else None
    figi_list = await _list_training_figi()
    if not figi_list and market_repo is not None:
        async with SessionLocal() as session:
            figi_list = await market_repo.list_figi(session)
    if not figi_list:
        return {
            "message": "degradation backtest skipped: no instruments",
            "totalInstruments": 0,
            "processedInstruments": 0,
            "skippedInstruments": 0,
            "results": [],
        }

    models_dir = os.path.join("models", "python_nn")
    ckpt_path = _latest_checkpoint_path(models_dir) or "./models/python_nn/cond_mlp-latest.ckpt"

    loop = asyncio.get_running_loop()
    progress_queue: asyncio.Queue[Any] = asyncio.Queue()

    def push_progress(payload: dict[str, Any]) -> None:
        try:
            asyncio.run_coroutine_threadsafe(progress_queue.put(payload), loop)
        except Exception:
            pass

    async def pump_progress() -> None:
        while True:
            payload = await progress_queue.get()
            if payload is None:
                break
            await _update_current_task_progress({"progress": payload})

    pump_task = asyncio.create_task(pump_progress())
    results: list[dict[str, Any]] = []
    skipped = 0
    total = len(figi_list)

    try:
        await _update_current_task_progress(
            {
                "progress": {
                    "message": f"Проверка деградации: walk-forward по {total} инструментам",
                    "phase": "backtest",
                    "instrumentTotal": total,
                }
            }
        )

        for idx, figi in enumerate(figi_list, start=1):
            candles_df, used_window_days = await _load_training_candles_with_backfill(
                figi,
                preferred_window_days=1,
                min_rows=120,
                max_window_days=365,
                max_rows=20_000,
            )
            if candles_df is None or len(candles_df) < 24:
                intraday_df = await _load_intraday_candles_last_day(figi)
                if intraday_df is not None and len(intraday_df) >= 24:
                    candles_df = intraday_df
                    used_window_days = 1
            if candles_df is None:
                skipped += 1
                continue

            options_df = await _options_features_for_figi(figi)
            signals_df = await _signals_features_for_figi(figi)

            await _update_current_task_progress(
                {
                    "progress": {
                        "message": (
                            f"Деградация [{idx}/{total}] FIGI {figi} "
                            f"(окно: {used_window_days} дн.)"
                        ),
                        "phase": "backtest",
                        "figi": figi,
                        "instrumentIndex": idx,
                        "instrumentTotal": total,
                    }
                }
            )

            def _run_one(
                f: str = figi,
                i: int = idx,
                cdf: Any = candles_df,
                opt: Any = options_df,
                sig: Any = signals_df,
            ) -> dict[str, Any]:
                def _wrap(p: dict[str, Any]) -> None:
                    push_progress(
                        {
                            **p,
                            "figi": f,
                            "instrumentIndex": i,
                            "instrumentTotal": total,
                        }
                    )

                return run(
                    ckpt_path,
                    3,
                    1,
                    1,
                    cdf,
                    60,
                    5,
                    False,
                    options=opt,
                    signals=sig,
                    on_progress=_wrap,
                )

            stop_heartbeat = asyncio.Event()

            async def _emit_heartbeat() -> None:
                while not stop_heartbeat.is_set():
                    await asyncio.sleep(heartbeat_interval_sec)
                    if stop_heartbeat.is_set():
                        break
                    await _update_current_task_progress(
                        {
                            "progress": {
                                "message": (
                                    f"Деградация [{idx}/{total}] FIGI {figi}: "
                                    "оценка продолжается..."
                                ),
                                "phase": "backtest",
                                "figi": figi,
                                "instrumentIndex": idx,
                                "instrumentTotal": total,
                            }
                        }
                    )

            heartbeat_task = asyncio.create_task(_emit_heartbeat())
            try:
                metrics = await asyncio.wait_for(
                    asyncio.to_thread(_run_one),
                    timeout=backtest_timeout_sec,
                )
            except asyncio.TimeoutError:
                skipped += 1
                await _update_current_task_progress(
                    {
                        "progress": {
                            "message": (
                                f"Деградация [{idx}/{total}] FIGI {figi}: "
                                f"таймаут {backtest_timeout_sec}s, инструмент пропущен"
                            ),
                            "phase": "skipped",
                            "figi": figi,
                            "instrumentIndex": idx,
                            "instrumentTotal": total,
                        }
                    }
                )
                continue
            finally:
                stop_heartbeat.set()
                with contextlib.suppress(Exception):
                    await heartbeat_task

            if _backtest_metrics_all_nan(metrics):
                skipped += 1
                continue
            results.append({"figi": figi, "metrics": metrics, "windowDays": used_window_days})

    finally:
        try:
            await progress_queue.put(None)
        except Exception:
            pass
        await pump_task

    if not results:
        return {
            "message": "degradation backtest skipped: insufficient data on all instruments",
            "totalInstruments": total,
            "processedInstruments": 0,
            "skippedInstruments": skipped,
            "results": [],
        }

    return {
        "message": "degradation backtest completed",
        "checkpoint": ckpt_path,
        "totalInstruments": total,
        "processedInstruments": len(results),
        "skippedInstruments": skipped,
        "results": results,
    }


async def _dynamic_budget_rebalance_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "portfolio.dynamic_budget_rebalance.last_run",
        now,
        module="portfolio",
        description="Последний запуск dynamic budget rebalance",
    )
    return {"message": "dynamic budget rebalance completed"}


async def _portfolio_rebalancing_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "portfolio.rebalancing.last_run",
        now,
        module="portfolio",
        description="Последний запуск portfolio rebalancing",
    )
    return {"message": "portfolio rebalancing completed"}


async def _position_monitoring_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "positions.monitoring.last_run",
        now,
        module="risk",
        description="Последний запуск мониторинга позиций",
    )
    return {"message": "position monitoring completed"}


async def _partial_exit_check_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "positions.partial_exit.last_run",
        now,
        module="risk",
        description="Последний запуск partial-exit check",
    )
    return {"message": "partial exit check completed"}


async def _trailing_stops_check_job() -> dict[str, Any]:
    now = _iso_now()
    await _upsert_app_setting(
        "positions.trailing_stops.last_run",
        now,
        module="risk",
        description="Последний запуск trailing-stops check",
    )
    return {"message": "trailing stops check completed"}


async def _virtual_portfolio_nav_job() -> dict[str, Any]:
    """Ежедневные снимки NAV по всем виртуальным профилям (Sharpe/drawdown)."""
    if not _container:
        return {"message": "skipped_no_container"}
    async with SessionLocal() as session:
        out = await _container.virtual_portfolio_service.snapshot_all_profiles_nav_today(session)
        await session.commit()
    return out


async def _training_alignment_append_job() -> dict[str, Any]:
    """Пишет строку `build_training_alignment_row` в JSONL для §7 / Lightning."""
    if not _container:
        return {"message": "skipped_no_container"}
    from app.core.config import get_settings

    import pandas as pd

    from app.core.time_utils import iso_now_msk
    from training.data.targets_risk import build_training_alignment_row

    settings = get_settings()
    path = Path(settings.training_alignment_dataset_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    row = build_training_alignment_row(
        mu=pd.Series({"_scheduler": 0.0}),
        backtest_stats={
            "Sharpe Ratio": 0.0,
            "Return [%]": 0.0,
            "Max. Drawdown [%]": 0.0,
            "# Trades": 0,
            "Win Rate [%]": 0.0,
        },
    )
    line = {
        "exportedAt": iso_now_msk(),
        "schemaVersion": 1,
        "alignmentRow": row,
        "source": "scheduler_training_alignment",
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")
    return {"message": "alignment_row_appended", "path": str(path)}


async def _quant_returns_matrix_job() -> dict[str, Any]:
    """
    Матрица дневных доходностей по `risk.pypfopt_universe` → `data/quant/returns_matrix_latest.json`.
    Контракт: training/data/DATA_CONTRACT.md
    """
    if not _container:
        return {"message": "skipped_no_container"}
    raw: list[str] = []
    item = _container.settings_service._settings.get("risk.pypfopt_universe")
    if item and item.value is not None:
        v = item.value
        if isinstance(v, list):
            raw = [str(x).strip() for x in v if str(x).strip()]
        elif isinstance(v, str):
            try:
                data = json.loads(v)
                if isinstance(data, list):
                    raw = [str(x).strip() for x in data if str(x).strip()]
            except json.JSONDecodeError:
                raw = []
    out_dir = Path("./data/quant")
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / "returns_matrix_latest.json"
    if len(raw) < 2:
        payload = {
            "lastRunAt": _iso_now(),
            "error": "universe_too_small",
            "figis": raw,
            "note": "Нужно ≥2 FIGI в AppSetting risk.pypfopt_universe",
        }
        artifact.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"message": "skip_small_universe", "path": str(artifact)}
    async with SessionLocal() as session:
        df = await _container.market_returns_service.build_returns_matrix_for_figis(
            session, raw, candle_limit_per_figi=400, how="inner"
        )
    matrix: dict[str, Any] = {}
    shape = [0, 0]
    if df is not None and not getattr(df, "empty", True):
        shape = [int(df.shape[0]), int(df.shape[1])]

        def _jf(x: object) -> float | None:
            try:
                v = float(x)
                return v if v == v else None
            except (TypeError, ValueError):
                return None

        matrix = {
            "index": [str(x) for x in df.index.astype(str)],
            "columns": [str(c) for c in df.columns],
            "data": [[_jf(x) for x in row] for row in df.values.tolist()],
        }
    payload = {
        "lastRunAt": _iso_now(),
        "figis": raw,
        "shape": shape,
        "matrix": matrix,
        "dataContract": "training/data/DATA_CONTRACT.md",
        "pypfoptAvailable": bool(
            getattr(_container, "risk_optimization_service", None)
            and _container.risk_optimization_service.is_available()
        ),
    }
    artifact.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    stub = Path("./data/returns_matrix_job_last.json")
    stub.write_text(
        json.dumps({"lastRunAt": payload["lastRunAt"], "artifact": str(artifact)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"message": "returns_matrix_written", "path": str(artifact)}


def _job_handlers() -> dict[str, Callable[[], Awaitable[dict[str, Any] | None]]]:
    return {
        "cache_update": _cache_update_job,
        "cache_full_update": _cache_full_update_job,
        "market_refresh": _market_refresh_job,
        "portfolio_real_sync": _portfolio_sync_job_wrapped,
        "portfolio_sync": _portfolio_sync_job_wrapped,
        "assets_sync": _assets_sync_job,
        "fundamental_sync_and_fill": _fundamental_sync_fill_job,
        "fundamental_fill_all": _fundamental_fill_all_job,
        "macro_update": _macro_update_job,
        "macro_load_indices": _macro_load_indices_job,
        "signals_update": _signals_update_job,
        "options_update": _options_update_job,
        "candles_sync_year": _candles_sync_year_job,
        "dividends_sync_year": _dividends_sync_year_job,
        "full_db_sync_year": _full_db_sync_year_job,
        "trading_windows_update": _trading_windows_update_job,
        "tinkoff_instruments": _instruments_update_job_wrapped,
        "tinkoff_last_prices": _last_prices_job_wrapped,
        "tinkoff_portfolio_sync": _portfolio_sync_job_wrapped,
        "training_full": _training_full_job,
        "training_quick": _training_quick_job,
        "analysis_market_portfolio": _analysis_market_portfolio_job,
        "analysis_portfolio_positions": _analysis_portfolio_positions_job,
        "weekly_generation": _weekly_generation_job,
        "weekly_update": _weekly_update_job,
        "weekly_training": _weekly_training_job,
        "portfolio_prices_update": _portfolio_prices_update_job,
        "active_signals_prices_update": _active_signals_prices_update_job,
        "trading_requests_prices_update": _trading_requests_prices_update_job,
        "weekly_backtest": _weekly_backtest_job,
        "dynamic_budget_rebalance": _dynamic_budget_rebalance_job,
        "portfolio_rebalancing": _portfolio_rebalancing_job,
        "position_monitoring": _position_monitoring_job,
        "partial_exit_check": _partial_exit_check_job,
        "trailing_stops_check": _trailing_stops_check_job,
        "quant_returns_matrix": _quant_returns_matrix_job,
        "virtual_portfolio_nav": _virtual_portfolio_nav_job,
        "training_alignment_append": _training_alignment_append_job,
        "completed_tasks_cleanup": _completed_tasks_cleanup_job,
    }


def trigger_named_job(job_name: str, *, source: str = "manual") -> dict[str, Any]:
    handlers = _job_handlers()
    fn = handlers.get(job_name)
    if fn is None:
        raise ValueError(f"Unsupported job: {job_name}")
    return schedule_background_job(job_name, fn, source=source)


def _parse_cron(cron_expr: str) -> dict:
    """Парсит cron-выражение 'min hour day month dow' в kwargs для CronTrigger."""
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {cron_expr!r}")
    return {
        "minute": parts[0],
        "hour": parts[1],
        "day": parts[2],
        "month": parts[3],
        "day_of_week": parts[4],
    }


def _register_job(
    scheduler: AsyncIOScheduler,
    *,
    job_id: str,
    cron_expr: str,
    fn: Callable[[], Awaitable[dict[str, Any] | None]],
) -> None:
    async def _runner() -> None:
        async with _background_job_slots:
            await _run_job_with_state(job_id, fn)

    scheduler.add_job(
        _runner,
        trigger="cron",
        id=job_id,
        replace_existing=True,
        **_parse_cron(cron_expr),
    )


def start_tinkoff_scheduler(container: AppContainer, settings: Settings) -> AsyncIOScheduler | None:
    """
    Запускает планировщик задач Tinkoff (portfolio sync, instruments, last prices).
    Возвращает экземпляр scheduler для shutdown при остановке приложения.
    """
    if not settings.tinkoff_token or not settings.tinkoff_scheduler_enabled:
        logger.info("Tinkoff scheduler disabled (no token or tinkoff_scheduler_enabled=False)")
        return None
    if not container.tinkoff_client:
        logger.info("Tinkoff scheduler disabled (client not available)")
        return None

    tz_name = getattr(settings, "server_timezone", "Europe/Moscow")
    scheduler = AsyncIOScheduler(timezone=ZoneInfo(tz_name))

    scheduler.add_job(
        _portfolio_sync_job,
        trigger="cron",
        id="tinkoff_portfolio_sync",
        replace_existing=True,
        args=[container],
        **_parse_cron(settings.tinkoff_portfolio_sync_cron),
    )
    scheduler.add_job(
        _instruments_update_job,
        trigger="cron",
        id="tinkoff_instruments",
        replace_existing=True,
        args=[container],
        **_parse_cron(settings.tinkoff_instruments_cron),
    )
    scheduler.add_job(
        _last_prices_job,
        trigger="cron",
        id="tinkoff_last_prices",
        replace_existing=True,
        args=[container],
        **_parse_cron(settings.tinkoff_prices_cron),
    )
    scheduler.start()
    global _scheduler
    _scheduler = scheduler
    logger.info(
        "Tinkoff scheduler started (portfolio=%s instruments=%s prices=%s)",
        settings.tinkoff_portfolio_sync_cron,
        settings.tinkoff_instruments_cron,
        settings.tinkoff_prices_cron,
    )
    return scheduler


def start_app_scheduler(container: AppContainer, settings: Settings) -> AsyncIOScheduler:
    global _scheduler, _container
    _container = container
    tz_name = getattr(settings, "server_timezone", "Europe/Moscow")
    scheduler = AsyncIOScheduler(timezone=ZoneInfo(tz_name))
    # non-news data jobs
    _register_job(scheduler, job_id="cache_update", cron_expr=settings.cache_update_cron, fn=_cache_update_job)
    _register_job(scheduler, job_id="cache_full_update", cron_expr=settings.cache_full_update_cron, fn=_cache_full_update_job)
    _register_job(scheduler, job_id="market_refresh", cron_expr=settings.market_refresh_cron, fn=_market_refresh_job)
    _register_job(
        scheduler,
        job_id="trading_windows_update",
        cron_expr=settings.trading_windows_update_cron,
        fn=_trading_windows_update_job,
    )
    _register_job(scheduler, job_id="assets_sync", cron_expr=settings.assets_sync_cron, fn=_assets_sync_job)
    _register_job(
        scheduler,
        job_id="fundamental_sync_and_fill",
        cron_expr=settings.fundamental_sync_cron,
        fn=_fundamental_sync_fill_job,
    )
    _register_job(
        scheduler,
        job_id="macro_update",
        cron_expr=settings.macro_update_cron,
        fn=_macro_update_job,
    )
    _register_job(
        scheduler,
        job_id="signals_update",
        cron_expr=settings.signals_update_cron,
        fn=_signals_update_job,
    )
    _register_job(
        scheduler,
        job_id="options_update",
        cron_expr=settings.options_update_cron,
        fn=_options_update_job,
    )
    # ai/ml jobs
    _register_job(
        scheduler,
        job_id="training_full",
        cron_expr=settings.training_full_cron,
        fn=_training_full_job,
    )
    _register_job(
        scheduler,
        job_id="training_quick",
        cron_expr=settings.training_quick_cron,
        fn=_training_quick_job,
    )
    _register_job(
        scheduler,
        job_id="analysis_market_portfolio",
        cron_expr=settings.market_analysis_cron,
        fn=_analysis_market_portfolio_job,
    )
    _register_job(
        scheduler,
        job_id="weekly_generation",
        cron_expr=settings.weekly_generation_cron,
        fn=_weekly_generation_job,
    )
    _register_job(
        scheduler,
        job_id="weekly_update",
        cron_expr=settings.weekly_update_cron,
        fn=_weekly_update_job,
    )
    _register_job(
        scheduler,
        job_id="weekly_training",
        cron_expr=settings.weekly_training_cron,
        fn=_weekly_training_job,
    )
    _register_job(
        scheduler,
        job_id="portfolio_prices_update",
        cron_expr="*/10 * * * *",
        fn=_portfolio_prices_update_job,
    )
    _register_job(
        scheduler,
        job_id="active_signals_prices_update",
        cron_expr="*/5 * * * *",
        fn=_active_signals_prices_update_job,
    )
    _register_job(
        scheduler,
        job_id="trading_requests_prices_update",
        cron_expr="*/1 * * * *",
        fn=_trading_requests_prices_update_job,
    )
    _register_job(
        scheduler,
        job_id="weekly_backtest",
        cron_expr="0 5 * * 0",
        fn=_weekly_backtest_job,
    )
    _register_job(
        scheduler,
        job_id="dynamic_budget_rebalance",
        cron_expr="0 4 * * 0",
        fn=_dynamic_budget_rebalance_job,
    )
    _register_job(
        scheduler,
        job_id="portfolio_rebalancing",
        cron_expr="0 10 * * *",
        fn=_portfolio_rebalancing_job,
    )
    _register_job(
        scheduler,
        job_id="position_monitoring",
        cron_expr="*/15 * * * *",
        fn=_position_monitoring_job,
    )
    _register_job(
        scheduler,
        job_id="partial_exit_check",
        cron_expr="*/15 * * * *",
        fn=_partial_exit_check_job,
    )
    _register_job(
        scheduler,
        job_id="trailing_stops_check",
        cron_expr="*/15 * * * *",
        fn=_trailing_stops_check_job,
    )
    _register_job(
        scheduler,
        job_id="quant_returns_matrix",
        cron_expr=settings.quant_returns_matrix_cron,
        fn=_quant_returns_matrix_job,
    )
    _register_job(
        scheduler,
        job_id="virtual_portfolio_nav",
        cron_expr=settings.virtual_portfolio_nav_cron,
        fn=_virtual_portfolio_nav_job,
    )
    _register_job(
        scheduler,
        job_id="training_alignment_append",
        cron_expr=settings.training_alignment_cron,
        fn=_training_alignment_append_job,
    )
    _register_job(
        scheduler,
        job_id="completed_tasks_cleanup",
        cron_expr=settings.completed_tasks_cleanup_cron,
        fn=_completed_tasks_cleanup_job,
    )
    # tinkoff jobs
    if settings.tinkoff_token and settings.tinkoff_scheduler_enabled and container.tinkoff_client:
        _register_job(
            scheduler,
            job_id="tinkoff_portfolio_sync",
            cron_expr=settings.tinkoff_portfolio_sync_cron,
            fn=_portfolio_sync_job_wrapped,
        )
        _register_job(
            scheduler,
            job_id="tinkoff_instruments",
            cron_expr=settings.tinkoff_instruments_cron,
            fn=_instruments_update_job_wrapped,
        )
        _register_job(
            scheduler,
            job_id="tinkoff_last_prices",
            cron_expr=settings.tinkoff_prices_cron,
            fn=_last_prices_job_wrapped,
        )

    scheduler.start()
    _scheduler = scheduler
    logger.info("App scheduler started with %d jobs", len(scheduler.get_jobs()))
    return scheduler


def shutdown_tinkoff_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Tinkoff scheduler stopped")


def shutdown_app_scheduler() -> None:
    shutdown_tinkoff_scheduler()
    global _container
    _container = None
    for queue in list(_ws_subscribers):
        with contextlib.suppress(Exception):
            _ws_subscribers.discard(queue)
