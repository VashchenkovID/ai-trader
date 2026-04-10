"""Простые индикаторы на pandas (REWRITE_CORE §2 MVP, без pandas_ta в core deps)."""

from __future__ import annotations

import pandas as pd


def simple_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Классический RSI по дневным close; период по умолчанию 14."""
    delta = close.astype(float).diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, float("nan"))
    return 100.0 - (100.0 / (1.0 + rs))


def bollinger_width(close: pd.Series, window: int = 20, num_std: float = 2.0) -> pd.Series:
    """Ширина полос Боллинджера / средняя цена — безразмерная волатильность."""
    m = close.rolling(window=window, min_periods=max(2, window // 2)).mean()
    s = close.rolling(window=window, min_periods=max(2, window // 2)).std()
    upper = m + num_std * s
    lower = m - num_std * s
    return (upper - lower) / m.replace(0.0, float("nan"))
