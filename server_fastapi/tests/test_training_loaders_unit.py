from __future__ import annotations

import pandas as pd

from training.data.loaders import candles_to_dataframe


def test_candles_to_dataframe_skips_dirty_rows() -> None:
    rows = [
        {"candle_time": "2026-01-01", "close": "bad", "volume": "x"},
        {"candle_time": None, "close": 100, "volume": 10},
        {"candle_time": "2026-01-02", "close": 101, "volume": 11},
    ]
    df = candles_to_dataframe(rows)
    assert isinstance(df, pd.DataFrame)
    assert len(df) == 1
    assert float(df.iloc[0]["close"]) == 101.0
