"""Простой JSONL-аудит критичных действий (финал: режим real, preflight)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _path() -> Path:
    p = getattr(get_settings(), "audit_log_path", None)
    if isinstance(p, str) and p.strip():
        return Path(p)
    return Path("./logs/audit.jsonl")


def append_audit(event: str, payload: dict[str, Any]) -> None:
    line = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **payload,
    }
    try:
        path = _path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.open("a", encoding="utf-8").write(json.dumps(line, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.warning("audit append failed: %s", e)
