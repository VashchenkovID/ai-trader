"""
CLI: экспорт одной строки датасета (mu + метрики бэктеста) — REWRITE_CORE §7.

Пример:
  cd server_fastapi
  python -m training.tools.export_alignment_row --out data/training/alignment_sample.json

Без БД: использует синтетические mu и фиктивные stats для проверки цепочки.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.data.targets_risk import build_training_alignment_row


def main() -> None:
    parser = argparse.ArgumentParser(description="Export training alignment row (§7 MVP)")
    parser.add_argument(
        "--out",
        default="data/training/alignment_sample.json",
        help="Путь к JSON с плоской строкой фичей",
    )
    args = parser.parse_args()
    mu = pd.Series({"BBG000TEST1": 0.12, "BBG000TEST2": 0.08})
    stats = {
        "Sharpe Ratio": 1.1,
        "Return [%]": 8.5,
        "Max. Drawdown [%]": -4.2,
        "# Trades": 12,
        "Win Rate [%]": 55.0,
    }
    row = build_training_alignment_row(mu=mu, backtest_stats=stats)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(row, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path.resolve()} keys={len(row)}")


if __name__ == "__main__":
    main()
