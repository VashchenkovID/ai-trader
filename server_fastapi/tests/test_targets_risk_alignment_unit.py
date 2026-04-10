from __future__ import annotations

import pandas as pd

from training.data.targets_risk import build_training_alignment_row


def test_build_training_alignment_row_merges() -> None:
    mu = pd.Series({"BBG1": 0.1, "BBG2": 0.2})
    stats = {"Sharpe Ratio": 1.5, "Return [%]": 10.0}
    row = build_training_alignment_row(mu=mu, backtest_stats=stats)
    assert row["BBG1"] == 0.1
    assert row.get("Sharpe_Ratio") == 1.5
