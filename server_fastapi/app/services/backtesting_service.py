"""
Бэктест на backtesting.py. Данные только до текущего бара внутри движка (anti-lookahead).

Требует optional-зависимости `quant`.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

try:
    from backtesting import Backtest, Strategy

    _BT_AVAILABLE = True
except ImportError:
    Backtest = None  # type: ignore[misc, assignment]
    Strategy = object  # type: ignore[misc, assignment]
    _BT_AVAILABLE = False


if _BT_AVAILABLE:
    class _SmaCross(Strategy):  # type: ignore[misc, valid-type]
        """Простая стратегия для MVP: цена выше SMA(n) — в лонг."""

        n = 20

        def init(self) -> None:
            pass

        def next(self) -> None:
            if len(self.data.Close) < self.n:
                return
            c = float(self.data.Close[-1])
            sma = float(self.data.Close[-self.n :].mean())
            if c > sma:
                if not self.position:
                    self.buy()
            elif c < sma and self.position:
                self.position.close()

else:

    class _SmaCross:  # placeholder when backtesting not installed
        n = 20


def ohlcv_from_candles_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Приводит DataFrame к колонкам Open, High, Low, Close, Volume для Backtest.
    Ожидаются lower-case или переданные явно.
    """
    colmap = {c.lower(): c for c in df.columns}
    out = pd.DataFrame(index=df.index)
    for src, dst in (
        ("open", "Open"),
        ("high", "High"),
        ("low", "Low"),
        ("close", "Close"),
        ("volume", "Volume"),
    ):
        key = None
        for k in colmap:
            if k == src:
                key = colmap[k]
                break
        if key is None and src == "close" and "close" in df.columns:
            key = "close"
        if key is None:
            continue
        out[dst] = pd.to_numeric(df[key], errors="coerce")
    if "Volume" not in out.columns and "volume" in df.columns:
        out["Volume"] = pd.to_numeric(df["volume"], errors="coerce")
    elif "Volume" not in out.columns:
        out["Volume"] = 1.0
    out = out.dropna(subset=["Close"])
    return out


class BacktestingService:
    @staticmethod
    def is_available() -> bool:
        return _BT_AVAILABLE

    @staticmethod
    def run_sma_backtest(
        ohlcv: pd.DataFrame,
        *,
        cash: float = 100_000.0,
        commission: float = 0.001,
        sma_period: int = 20,
    ) -> dict[str, Any]:
        """
        Запускает бэктест SMA-кросса. ohlcv — индекс дат, колонки OHLCV.
        """
        if not _BT_AVAILABLE or ohlcv is None or ohlcv.empty:
            return {"ok": False, "error": "backtesting_unavailable_or_empty_data"}
        df = ohlcv_from_candles_df(ohlcv)
        if df.empty or "Close" not in df.columns:
            return {"ok": False, "error": "missing_ohlcv"}

        class _S(_SmaCross):
            n = sma_period

        bt = Backtest(df, _S, cash=cash, commission=commission)
        stats = bt.run()
        # stats — pandas Series с метриками
        out_stats: dict[str, Any] = {}
        try:
            for k, v in stats.items():
                try:
                    out_stats[str(k)] = float(v) if hasattr(v, "real") else v
                except Exception:
                    out_stats[str(k)] = str(v)
        except Exception:
            out_stats["raw"] = str(stats)
        return {
            "ok": True,
            "stats": out_stats,
            "params": {"cash": cash, "commission": commission, "sma_period": sma_period},
        }
