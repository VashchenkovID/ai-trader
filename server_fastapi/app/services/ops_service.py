from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.core.time_utils import iso_now_msk, now_msk


class OpsService:
    """
    Операционный контур cutover/rollback.

    Управляет режимом трафика и правилами записи:
    - normal: штатный режим;
    - shadow: write-операции заблокированы;
    - canary: write-операции разрешены только для доли запросов;
    - rollback: write-операции заблокированы (экстренный возврат).
    """

    VALID_MODES = {"normal", "shadow", "canary", "rollback"}

    def __init__(
        self,
        *,
        backup_rollup_path: str = "./data/cutover_backups/cutover_backups.jsonl",
        backup_keep_raw: int = 5,
    ) -> None:
        self._mode = "normal"
        self._canary_percent = 0
        self._backup_rollup_path = Path(backup_rollup_path)
        self._backup_keep_raw = max(int(backup_keep_raw), 1)

    def get_status(self) -> dict[str, object]:
        return {
            "mode": self._mode,
            "canaryPercent": self._canary_percent,
            "writeEnabled": self._mode in {"normal", "canary"},
            "timestamp": now_msk(),
        }

    def set_mode(self, mode: str) -> dict[str, object]:
        if mode not in self.VALID_MODES:
            raise ValueError(f"Unsupported mode: {mode}")
        self._mode = mode
        if mode != "canary":
            self._canary_percent = 0
        return self.get_status()

    def set_canary_percent(self, percent: int) -> dict[str, object]:
        if percent < 0 or percent > 100:
            raise ValueError("canary percent must be in [0, 100]")
        self._mode = "canary"
        self._canary_percent = percent
        return self.get_status()

    def evaluate_request(self, *, request_id: str, method: str, path: str) -> dict[str, object]:
        is_write = method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
        is_ops_control = path.startswith("/api/v1/system/ops")

        if is_ops_control or not is_write:
            return {"mode": self._mode, "writeAllowed": True, "canarySelected": True}

        if self._mode in {"shadow", "rollback"}:
            return {"mode": self._mode, "writeAllowed": False, "canarySelected": False}

        if self._mode == "canary":
            selected = self._is_canary_selected(request_id)
            return {"mode": self._mode, "writeAllowed": selected, "canarySelected": selected}

        return {"mode": self._mode, "writeAllowed": True, "canarySelected": True}

    def _is_canary_selected(self, request_id: str) -> bool:
        if self._canary_percent <= 0:
            return False
        if self._canary_percent >= 100:
            return True
        digest = hashlib.sha256(request_id.encode("utf-8")).hexdigest()
        bucket = int(digest[:8], 16) % 100
        return bucket < self._canary_percent

    def create_backup_snapshot(self, backup_dir: str, payload: dict[str, object]) -> str:
        path = Path(backup_dir)
        path.mkdir(parents=True, exist_ok=True)
        name = f"cutover_snapshot_{now_msk().strftime('%Y%m%d_%H%M%S')}.json"
        out = path / name
        snapshot = {
            "createdAt": iso_now_msk(),
            "mode": self._mode,
            "canaryPercent": self._canary_percent,
            "payload": payload,
        }
        with out.open("w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2, default=str)
        self._append_backup_rollup(snapshot=snapshot, snapshot_path=out)
        self._prune_raw_snapshots(path)
        return str(out)

    def _append_backup_rollup(self, *, snapshot: dict[str, object], snapshot_path: Path) -> None:
        rollup = self._backup_rollup_path
        rollup.parent.mkdir(parents=True, exist_ok=True)
        row = {
            "createdAt": snapshot.get("createdAt"),
            "mode": snapshot.get("mode"),
            "canaryPercent": snapshot.get("canaryPercent"),
            "snapshotPath": str(snapshot_path),
            "counts": (snapshot.get("payload") or {}).get("counts", {}),
        }
        with rollup.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

    def _prune_raw_snapshots(self, backup_dir: Path) -> None:
        files = sorted(
            backup_dir.glob("cutover_snapshot_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for old in files[self._backup_keep_raw :]:
            old.unlink(missing_ok=True)
