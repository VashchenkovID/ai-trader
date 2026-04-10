"""Регрессия: SMA-бэктест не подглядывает в будущие бары (движок backtesting.py + окно Close)."""

from __future__ import annotations

import pandas as pd
import pytest

pytest.importorskip("backtesting")

from app.services.backtesting_service import BacktestingService, ohlcv_from_candles_df


def test_sma_backtest_is_deterministic() -> None:
    """Повторный прогон на тех же OHLCV даёт те же агрегаты (регрессия стабильности)."""
    if not BacktestingService.is_available():
        pytest.skip("backtesting optional stack")

    n = 30
    idx = pd.date_range("2022-01-01", periods=n, freq="D")
    closes = [100.0 + float(i) * 0.1 for i in range(n)]
    base = pd.DataFrame(
        {
            "open": closes,
            "high": [c + 0.05 for c in closes],
            "low": [c - 0.05 for c in closes],
            "close": closes,
            "volume": [1.0] * n,
        },
        index=idx,
    )
    ohlcv = ohlcv_from_candles_df(base)
    sma_period = 10
    r1 = BacktestingService.run_sma_backtest(ohlcv, sma_period=sma_period)
    r2 = BacktestingService.run_sma_backtest(ohlcv, sma_period=sma_period)
    assert r1.get("ok") and r2.get("ok")
    s1, s2 = r1.get("stats") or {}, r2.get("stats") or {}
    assert s1.get("# Trades") == s2.get("# Trades")
    assert s1.get("Return [%]") == s2.get("Return [%]")


def test_strategy_bar_only_sees_history_up_to_index() -> None:
    """На каждом шаге `next()` доступен только префикс ряда Close (без будущих точек)."""
    pytest.importorskip("backtesting")
    from backtesting import Backtest, Strategy

    lengths: list[int] = []

    class _Probe(Strategy):
        n = 5

        def init(self) -> None:
            pass

        def next(self) -> None:
            lengths.append(len(self.data.Close))

    idx = pd.date_range("2020-01-01", periods=40, freq="D")
    df = pd.DataFrame(
        {
            "Open": range(40),
            "High": range(40),
            "Low": range(40),
            "Close": range(40),
            "Volume": [1.0] * 40,
        },
        index=idx,
    )
    bt = Backtest(df, _Probe, cash=10_000, commission=0.0)
    bt.run()
    assert lengths
    # В новых версиях backtesting.py первый вызов `next()` бывает после второго бара.
    assert lengths[0] >= 1
    assert lengths[-1] == 40
    assert len(lengths) == 39
    assert all(lengths[i] + 1 == lengths[i + 1] for i in range(len(lengths) - 1))


def test_ohlcv_from_candles_preserves_order() -> None:
    idx = pd.date_range("2021-06-01", periods=15, freq="D")
    raw = pd.DataFrame({"close": list(range(15))}, index=idx)
    out = ohlcv_from_candles_df(raw)
    assert list(out["Close"].iloc[:5]) == [0.0, 1.0, 2.0, 3.0, 4.0]
