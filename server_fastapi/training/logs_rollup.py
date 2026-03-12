from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from app.core.time_utils import iso_now_msk
from training.config import TrainingSettings


def append_lightning_rollup(
    *,
    settings: TrainingSettings,
    training_type: str,
    run_id: str | None,
    checkpoint_path: str | None,
    params: dict[str, Any],
) -> None:
    out = Path(settings.lightning_rollup_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "timestamp": iso_now_msk(),
        "type": training_type,
        "runId": run_id,
        "checkpointPath": checkpoint_path,
        "params": params,
    }
    with out.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")


def prune_lightning_raw_dirs(*, settings: TrainingSettings) -> None:
    root = Path(settings.lightning_logs_dir)
    if not root.exists():
        return
    run_dirs = sorted(
        [p for p in root.glob("version_*") if p.is_dir()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    keep = max(int(settings.lightning_keep_raw), 1)
    for old in run_dirs[keep:]:
        shutil.rmtree(old, ignore_errors=True)
