from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.time_utils import iso_now_msk


@dataclass
class ErrorRecord:
    error_key: str
    error_message_sample: str
    count: int
    first_seen_at: str
    last_seen_at: str
    source: str
    last_trace_id: str | None = None


class FileErrorRegistry:
    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._lock = asyncio.Lock()

    async def record(
        self,
        *,
        error_key: str,
        error_message_sample: str,
        source: str,
        trace_id: str | None = None,
    ) -> None:
        now = iso_now_msk()
        async with self._lock:
            data = await asyncio.to_thread(self._read_data)
            records: dict[str, dict[str, Any]] = data.setdefault("errors", {})
            rec = records.get(error_key)
            if rec is None:
                records[error_key] = ErrorRecord(
                    error_key=error_key,
                    error_message_sample=error_message_sample[:500],
                    count=1,
                    first_seen_at=now,
                    last_seen_at=now,
                    source=source,
                    last_trace_id=trace_id,
                ).__dict__
            else:
                rec["count"] = int(rec.get("count", 0)) + 1
                rec["last_seen_at"] = now
                rec["last_trace_id"] = trace_id
                rec["error_message_sample"] = error_message_sample[:500]
                rec["source"] = source
            await asyncio.to_thread(self._write_data, data)

    async def list_top(self, limit: int = 100) -> list[dict[str, Any]]:
        async with self._lock:
            data = await asyncio.to_thread(self._read_data)
        records = list((data.get("errors") or {}).values())
        records.sort(
            key=lambda r: (int(r.get("count", 0)), str(r.get("last_seen_at", ""))),
            reverse=True,
        )
        return records[:limit]

    def _read_data(self) -> dict[str, Any]:
        if not self._path.exists():
            return {"errors": {}}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return {"errors": {}}

    def _write_data(self, data: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


_registry_singleton: FileErrorRegistry | None = None


def get_error_registry() -> FileErrorRegistry:
    global _registry_singleton
    if _registry_singleton is None:
        settings = get_settings()
        _registry_singleton = FileErrorRegistry(settings.error_registry_path)
    return _registry_singleton
