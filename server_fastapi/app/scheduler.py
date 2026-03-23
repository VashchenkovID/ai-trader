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

_scheduler: AsyncIOScheduler | None = None
_container: AppContainer | None = None


@dataclass
class TaskRecord:
    task_id: str
    task_type: str
    status: str
    queued_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
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
    return {
        "taskId": task.task_id,
        "taskType": task.task_type,
        "status": task.status,
        "queuedAt": task.queued_at,
        "startedAt": task.started_at,
        "finishedAt": task.finished_at,
        "error": task.error,
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
    try:
        result = await fn()
        state.status = "ok"
        state.last_success_at = _iso_now()
        state.last_error = None
        state.last_duration_ms = int((time.monotonic() - started) * 1000)
        await _publish("scheduler.status", {"job": _state_to_dict(state)})
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


def list_job_states() -> list[dict[str, Any]]:
    return [_state_to_dict(state) for state in _job_states.values()]


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
    rec.status = status
    if status == "running":
        rec.started_at = _iso_now()
    if status in {"failed", "completed"}:
        rec.finished_at = _iso_now()
    rec.error = error
    rec.result = result


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


async def _pick_best_training_figi(limit: int = 30) -> str | None:
    """Выбирает FIGI с максимальным числом свечей, чтобы обучение не было тривиально коротким."""
    async with SessionLocal() as session:
        if not hasattr(session, "execute"):
            return None
        rows = (
            await session.execute(
                select(Candle.figi, func.count(Candle.id).label("c"))
                .group_by(Candle.figi)
                .order_by(func.count(Candle.id).desc())
                .limit(limit)
            )
        ).all()
    for figi, cnt in rows:
        if isinstance(figi, str) and figi and int(cnt or 0) > 120:
            return figi
    for figi, _cnt in rows:
        if isinstance(figi, str) and figi:
            return figi
    return None


async def _list_training_figi(limit: int = 5000) -> list[str]:
    """Список FIGI для обучения (по убыванию количества свечей)."""
    async with SessionLocal() as session:
        if not hasattr(session, "execute"):
            return []
        rows = (
            await session.execute(
                select(Candle.figi, func.count(Candle.id).label("c"))
                .group_by(Candle.figi)
                .order_by(func.count(Candle.id).desc())
                .limit(limit)
            )
        ).all()
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
        return
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
        return
    try:
        async with SessionLocal() as session:
            figi_list = await container.market_repository.list_figi(session, limit=500)
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
        payload["assets"] = valid_assets[:100]
        asset_ids = [a.get("uid") for a in valid_assets if a.get("uid")]
        if asset_ids:
            fundamentals_raw = (
                (await _sync_call(client.get_asset_fundamentals, asset_ids[:100])).get("fundamentals") or []
            )
            payload["fundamentals"] = [f for f in fundamentals_raw if isinstance(f, dict)]
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
        figi_list = await _container.market_repository.list_figi(session, limit=100)
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
        figi_list = await _container.market_repository.list_figi(session, limit=100)
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
            figi_list = await _container.market_repository.list_figi(session, limit=50)
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
    except Exception:
        return {"message": "training deps unavailable"}
    target_figi: str | None = None
    market_repo = getattr(_container, "market_repository", None) if _container is not None else None
    if market_repo is not None:
        figi_list = await _list_training_figi(limit=5000)
        if not figi_list:
            async with SessionLocal() as session:
                figi_list = await market_repo.list_figi(session, limit=5000)
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
            nn_ckpt = _latest_checkpoint_path(os.path.join("models", "python_nn"))
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
        await _update_current_task_progress(
            {
                "progress": {
                    "phase": "nn",
                    "phaseIndex": 1,
                    "phaseTotal": 4,
                    "message": "Этап 1/3: обучение NN (fallback synthetic)",
                    "figi": None,
                }
            }
        )
        nn_run_id = await asyncio.to_thread(
            run_nn, 12, 32, 1e-3, None, None, 60, 5, True, options_df=None
        )
        await _update_current_task_progress(
            {
                "progress": {
                    "phase": "weekly",
                    "phaseIndex": 3,
                    "phaseTotal": 4,
                    "message": "Этап 3/4: обучение weekly-модели (fallback synthetic)",
                    "nnRunId": nn_run_id,
                    "figi": None,
                }
            }
        )
        weekly_run_id = await asyncio.to_thread(
            run_weekly, 12, 32, 1e-3, None, None, 30, 5, True, options_df=None
        )
        meta_runs = []
        total_instruments = 1
        trained_instruments = 1
    await _update_current_task_progress(
        {
            "progress": {
                "phase": "rl",
                "phaseIndex": 4,
                "phaseTotal": 4,
                "message": (
                    f"Этап 4/4: обучение RL-агента (контур по БД, FIGI {target_figi})"
                    if target_figi
                    else "Этап 4/4: обучение RL-агента (fallback synthetic)"
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
    return {
        "message": "full training completed",
        "figi": target_figi,
        "mlflowRunId": nn_run_id,
        "weeklyRunId": weekly_run_id,
        "metaRuns": meta_runs,
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
    except Exception:
        return {"message": "training deps unavailable"}
    target_figi: str | None = None
    market_repo = getattr(_container, "market_repository", None) if _container is not None else None
    if market_repo is not None:
        figi_list = await _list_training_figi(limit=5000)
        if not figi_list:
            async with SessionLocal() as session:
                figi_list = await market_repo.list_figi(session, limit=5000)
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
            nn_ckpt = _latest_checkpoint_path(os.path.join("models", "python_nn"))
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
        return {
            "message": "quick training completed",
            "figi": run_ids[0]["figi"],
            "mlflowRunId": run_ids[0]["runId"],
            "metaRuns": meta_runs,
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
    }


async def _analysis_market_portfolio_job() -> dict[str, Any]:
    if not _container:
        raise RuntimeError("Container is not initialized")
    # Анализ: обновляем LLM-пэйлоад рекомендаций (GigaChat/Alisa) и затем
    # прогоняем recommendation pipeline.
    from app.db.session import SessionLocal as _Session
    from app.services.llm_jury_service import run_jury_for_figi
    from app.api.v1.training import _default_jury_providers, _consensus_to_recommendation

    async with _Session() as session:
        providers = _default_jury_providers()
        llm_enriched = 0
        market_repo = getattr(_container, "market_repository", None)
        if providers and market_repo is not None:
            rec_rows = await market_repo.list_recommendations(session, offset=0, limit=50)
            figi_targets = [r.figi for r in rec_rows if getattr(r, "figi", None)]
            if not figi_targets:
                inst_rows = await market_repo.list_instruments(session, offset=0, limit=20)
                figi_targets = [i.figi for i in inst_rows if getattr(i, "figi", None)]
            for figi in figi_targets[:20]:
                try:
                    inst = await market_repo.get_instrument_by_figi(session, figi)
                    ticker = getattr(inst, "ticker", None) or figi
                    sector = getattr(inst, "sector", None) or "—"
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
                    summary = await run_jury_for_figi(
                        session,
                        figi=figi,
                        ticker=str(ticker),
                        context=context,
                        providers=providers,
                    )
                    payload = {
                        "providers": summary.get("provider_payload") or {},
                        "consensus": float(summary["consensus"]),
                        "dispersion": float(summary["dispersion"]),
                        "confidenceAvg": float(summary["confidence_avg"]),
                        "requiredProvidersPresent": bool(summary.get("required_providers_present")),
                        "source": "scheduler_analysis",
                    }
                    await market_repo.upsert_recommendation(
                        session,
                        figi=figi,
                        recommendation=_consensus_to_recommendation(float(summary["consensus"])),
                        confidence=Decimal(str(round(float(summary["confidence_avg"]), 4))),
                        score=Decimal(str(round(float(summary["consensus"]), 4))),
                        llm_jury_payload=payload,
                    )
                    llm_enriched += 1
                    await session.commit()
                except Exception as e:
                    logger.warning("LLM jury enrich failed for %s: %s", figi, e)
        data = await _container.recommendation_pipeline_service.run(
            session,
            mode="paper",
            min_confidence=Decimal("0"),
            min_score=Decimal("0"),
            limit=50,
        )
        return {"message": "analysis completed", "summary": data, "llmEnriched": llm_enriched}


async def _weekly_generation_job() -> dict[str, Any]:
    try:
        from training.run_weekly import run
    except Exception:
        return {"message": "weekly deps unavailable"}
    run_id = await asyncio.to_thread(run, 1)
    return {"message": "weekly generation completed", "mlflowRunId": run_id}


async def _weekly_update_job() -> dict[str, Any]:
    try:
        from training.run_weekly import run
    except Exception:
        return {"message": "weekly deps unavailable"}
    run_id = await asyncio.to_thread(run, 1, 16, 1e-3, None, None, 30, 5, True)
    return {"message": "weekly update completed", "mlflowRunId": run_id}


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
    figi_list = await _list_training_figi(limit=5000)
    if not figi_list and market_repo is not None:
        async with SessionLocal() as session:
            figi_list = await market_repo.list_figi(session, limit=5000)
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
