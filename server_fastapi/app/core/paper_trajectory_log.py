"""Структурированный JSONL-лог событий виртуального портфеля (paper MDP)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def append_paper_mdp_event(event: dict[str, Any]) -> None:
    """Добавляет одну строку JSON в лог; при отключении в настройках — no-op."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.paper_mdp_log_enabled:
        return
    path = Path(settings.paper_mdp_log_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        **event,
    }
    line = json.dumps(payload, ensure_ascii=False, default=str) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)
