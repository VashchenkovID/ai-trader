"""Unit tests for returns_matrix (Фаза A)."""

import pandas as pd

from training.data.returns_matrix import build_returns_matrix, daily_returns_from_close


def test_daily_returns_from_close():
    idx = pd.date_range("2024-01-01", periods=5, freq="D")
    close = pd.Series([100.0, 101.0, 99.0, 102.0, 103.0], index=idx)
    r = daily_returns_from_close(close)
    assert len(r) == 4
    assert abs(float(r.iloc[0]) - 0.01) < 1e-9


def test_build_returns_matrix_inner():
    idx = pd.date_range("2024-01-01", periods=10, freq="D")
    a = pd.Series(range(100, 110), index=idx, dtype=float)
    b = pd.Series(range(200, 210), index=idx, dtype=float)
    m = build_returns_matrix({"f1": a, "f2": b}, how="inner")
    assert not m.empty
    assert "f1" in m.columns and "f2" in m.columns
