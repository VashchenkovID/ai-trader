from __future__ import annotations

from pathlib import Path

from training.config import TrainingSettings
from training.logs_rollup import append_lightning_rollup, prune_lightning_raw_dirs


def test_lightning_rollup_append_and_prune(tmp_path: Path) -> None:
    logs_dir = tmp_path / "lightning_logs"
    (logs_dir / "version_1").mkdir(parents=True)
    (logs_dir / "version_2").mkdir(parents=True)
    (logs_dir / "version_3").mkdir(parents=True)
    (logs_dir / "version_4").mkdir(parents=True)

    settings = TrainingSettings(
        lightning_logs_dir=str(logs_dir),
        lightning_rollup_path=str(tmp_path / "logs" / "lightning_runs.jsonl"),
        lightning_keep_raw=2,
    )
    append_lightning_rollup(
        settings=settings,
        training_type="nn",
        run_id="r1",
        checkpoint_path="/tmp/ckpt.ckpt",
        params={"epochs": 1},
    )
    prune_lightning_raw_dirs(settings=settings)

    rollup = tmp_path / "logs" / "lightning_runs.jsonl"
    assert rollup.exists()
    assert "r1" in rollup.read_text(encoding="utf-8")
    kept = [p for p in logs_dir.glob("version_*") if p.is_dir()]
    assert len(kept) <= 2
