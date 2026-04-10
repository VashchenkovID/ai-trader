"""
Матрица доходностей для PyPortfolioOpt, бэктеста и обучения.

Контракт колонок OHLCV см. DATA_CONTRACT.md в этой папке.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def daily_returns_from_close(close: pd.Series, *, fill_method: str | None = "drop") -> pd.Series:
    """
    Дневные простые доходности: r_t = close_t / close_{t-1} - 1.
    Первый ряд — NaN.
    """
    s = close.astype(float).sort_index()
    r = s.pct_change()
    if fill_method == "drop":
        return r.dropna()
    if fill_method == "fill0":
        return r.fillna(0.0)
    return r


def build_returns_matrix(
    closes_by_figi: dict[str, pd.Series],
    *,
    how: str = "inner",
) -> pd.DataFrame:
    """
    Собирает wide DataFrame доходностей: индекс — даты, колонки — FIGI.

    closes_by_figi: для каждого FIGI — Series закрытий с DatetimeIndex.
    how: inner — только общие даты; outer — объединение с пропусками (заполнять до использования в pypfopt).

    Запрет look-ahead: доходность на дату t считается только из цен до t включительно;
    здесь используются только исторические ряды закрытий.
    """
    if not closes_by_figi:
        return pd.DataFrame()

    series_list: list[pd.Series] = []
    for figi, ser in closes_by_figi.items():
        if ser is None or ser.empty:
            continue
        c = ser.copy()
        if not isinstance(c.index, pd.DatetimeIndex):
            c.index = pd.to_datetime(c.index, errors="coerce")
        c = c[~c.index.isna()].sort_index()
        if c.empty:
            continue
        r = daily_returns_from_close(c, fill_method="drop")
        r.name = str(figi)
        series_list.append(r)

    if not series_list:
        return pd.DataFrame()

    df = pd.concat(series_list, axis=1)
    if how == "inner":
        return df.dropna(how="any")
    df = df.sort_index()
    return df


def returns_matrix_to_numpy(df: pd.DataFrame) -> tuple[np.ndarray, list[str], pd.DatetimeIndex]:
    """Для вызовов оптимизаторов: (T x N), список FIGI, индекс дат."""
    cols = [str(c) for c in df.columns]
    arr = df.values.astype(np.float64)
    return arr, cols, df.index


def annualize_simple_returns(daily_returns: pd.Series, *, trading_days: int = 252) -> float:
    """Среднегодовая простая доходность из дневного ряда (грубая аппроксимация)."""
    if daily_returns.empty:
        return 0.0
    mu_d = float(daily_returns.mean())
    return float(mu_d * trading_days)
