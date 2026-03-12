from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings


@lru_cache
def get_server_tz() -> ZoneInfo:
    settings = get_settings()
    return ZoneInfo(settings.server_timezone)


def now_msk() -> datetime:
    return datetime.now(get_server_tz())


def iso_now_msk() -> str:
    return now_msk().isoformat()
