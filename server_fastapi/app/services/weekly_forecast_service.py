"""On-demand инференс WeeklyForecastLSTM по свечам из БД."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SEC = 120.0


def _read_ckpt_hyper(path: Path) -> dict[str, Any] | None:
    try:
        import torch

        payload = torch.load(path, map_location="cpu")
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    hp = payload.get("hyper_parameters")
    return hp if isinstance(hp, dict) else None


def _candles_rows_to_dataframe(candles: list[dict[str, Any]]) -> Any:
    import pandas as pd

    if not candles:
        return pd.DataFrame()
    rows = []
    for c in candles:
        t = c.get("time")
        rows.append(
            {
                "time": t,
                "close": float(c.get("close") or 0),
                "volume": int(c.get("volume") or 0),
            }
        )
    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["time"])
    df = df.set_index("time").sort_index()
    return df


def run_weekly_forecast_sync(
    candles: list[dict[str, Any]],
    *,
    models_root: Path,
    cache_key: str | None = None,
) -> dict[str, Any]:
    """
    Строит последнее окно из свечей, загружает совместимый weekly ckpt, возвращает сырой выход (n_forecast).
    """
    now = time.monotonic()
    if cache_key:
        cached = _CACHE.get(cache_key)
        if cached and now - cached[0] < _CACHE_TTL_SEC:
            return dict(cached[1])

    try:
        import numpy as np
        import torch
        from training.data.pipeline import build_weekly_sequences
        from training.models.weekly_lightning import WeeklyForecastLightning
    except Exception as e:
        logger.warning("weekly forecast deps unavailable: %s", e)
        return {"ok": False, "reason": "deps_unavailable", "detail": str(e)}

    df = _candles_rows_to_dataframe(candles)
    if df.empty or len(df) < 55:
        return {"ok": False, "reason": "insufficient_candles", "totalCandles": len(df)}

    ckpt_dir = models_root / "weekly"
    if not ckpt_dir.is_dir():
        return {"ok": False, "reason": "no_weekly_checkpoint_dir"}

    ckpts = sorted(ckpt_dir.glob("*.ckpt"), key=lambda p: p.stat().st_mtime, reverse=True)
    last_close = float(df["close"].iloc[-1])

    for ckpt in ckpts:
        hp = _read_ckpt_hyper(ckpt)
        if not hp:
            continue
        try:
            seq_len = int(hp["seq_len"])
            n_forecast = int(hp["n_forecast"])
            input_size = int(hp["input_size"])
        except (KeyError, TypeError, ValueError):
            continue

        X_seq, _y = build_weekly_sequences(
            df,
            seq_len=seq_len,
            n_forecast=n_forecast,
        )
        if X_seq.shape[0] == 0:
            return {"ok": False, "reason": "insufficient_candles", "totalCandles": len(df)}
        if X_seq.shape[-1] != input_size:
            continue

        x = torch.tensor(X_seq[-1:], dtype=torch.float32)
        try:
            model = WeeklyForecastLightning.load_from_checkpoint(str(ckpt), map_location="cpu")
        except Exception as e:
            logger.warning("failed to load weekly ckpt %s: %s", ckpt, e)
            continue
        model.eval()
        with torch.no_grad():
            out = model(x)
        pred = out.detach().cpu().numpy().reshape(-1).tolist()

        result: dict[str, Any] = {
            "ok": True,
            "checkpoint": ckpt.name,
            "seqLen": seq_len,
            "nForecast": n_forecast,
            "inputSize": input_size,
            "lastClose": last_close,
            "forecastRaw": pred,
            "meanForecast": float(np.mean(pred)) if pred else None,
        }
        if cache_key:
            _CACHE[cache_key] = (time.monotonic(), dict(result))
        return result

    return {"ok": False, "reason": "no_compatible_checkpoint"}
