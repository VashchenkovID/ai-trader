"""
Загрузка свечей для обучения: CSV и преобразование из репозитория (список записей).

Использование:
  - Из файла: df = load_candles_from_csv("path/to/candles.csv")
  - Из БД (app): rows = await market_repo.get_candles_by_figi(...); df = candles_to_dataframe(rows)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

import pandas as pd


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def load_candles_from_csv(path: str | Path) -> pd.DataFrame:
    """
    Загружает свечи из CSV.

    Ожидаемые колонки: candle_time (или date), close, volume; опционально open, high, low.
    Индекс — DatetimeIndex по candle_time/date. Сортировка по возрастанию даты.
    """
    path = Path(path)
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path)
    time_col = "candle_time" if "candle_time" in df.columns else "date"
    if time_col not in df.columns:
        return pd.DataFrame()
    df[time_col] = pd.to_datetime(df[time_col])
    df = df.sort_values(time_col).set_index(time_col)
    if "close" not in df.columns:
        return pd.DataFrame()
    if "volume" not in df.columns:
        df["volume"] = 0
    df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0).astype("int64")
    cols = ["close", "volume"]
    for c in ["open", "high", "low"]:
        if c in df.columns:
            cols.append(c)
    return df[[c for c in cols if c in df.columns]]


def candles_to_dataframe(rows: Sequence[Any]) -> pd.DataFrame:
    """
    Преобразует список записей свечей (из БД или API) в DataFrame для пайплайна.

    Каждый элемент — объект с атрибутами candle_time, close, volume (или словарь с этими ключами).
    Опционально: open, high, low.
    """
    if not rows:
        return pd.DataFrame()
    out: list[dict[str, Any]] = []
    for r in rows:
        if hasattr(r, "candle_time"):
            t = getattr(r, "candle_time")
            close = _to_float(getattr(r, "close", 0))
            vol = _to_int(getattr(r, "volume", 0))
            open_ = _to_float(getattr(r, "open", close))
            high = _to_float(getattr(r, "high", close))
            low = _to_float(getattr(r, "low", close))
        elif isinstance(r, dict):
            t = r.get("candle_time") or r.get("date") or r.get("time")
            close = _to_float(r.get("close", 0))
            vol = _to_int(r.get("volume", 0))
            open_ = _to_float(r.get("open", close))
            high = _to_float(r.get("high", close))
            low = _to_float(r.get("low", close))
        else:
            continue
        if t is None or close is None:
            continue
        if vol is None:
            vol = 0
        if open_ is None:
            open_ = close
        if high is None:
            high = close
        if low is None:
            low = close
        out.append({"candle_time": t, "close": close, "volume": vol, "open": open_, "high": high, "low": low})
    if not out:
        return pd.DataFrame()
    df = pd.DataFrame(out)
    df["candle_time"] = pd.to_datetime(df["candle_time"], errors="coerce")
    df = df.dropna(subset=["candle_time", "close"])
    if df.empty:
        return pd.DataFrame()
    df = df.sort_values("candle_time").set_index("candle_time")
    return df
