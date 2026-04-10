"""Синхронизация in-memory SettingsService с таблицей app_settings."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppSetting


def serialize_setting_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def parse_stored_value(raw: str) -> Any:
    """Восстанавливает значение из строки в БД (как в seed/bootstrap)."""
    s = raw.strip()
    if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
    low = s.lower()
    if low in ("true", "false"):
        return low == "true"
    try:
        if "." in s or "e" in low:
            return float(s)
        return int(s)
    except ValueError:
        return s


async def hydrate_settings_service_from_db(session: AsyncSession, settings_service: Any) -> None:
    """Загружает app_settings в память после рестарта процесса."""
    result = await session.execute(select(AppSetting.key, AppSetting.value))
    for key, val in result.all():
        if not isinstance(key, str):
            continue
        try:
            parsed = parse_stored_value(str(val))
            settings_service.update(key, parsed)
        except Exception:
            continue


async def upsert_app_setting(session: AsyncSession, key: str, value: Any) -> None:
    """Сохраняет значение настройки в БД (строковое представление)."""
    sval = serialize_setting_value(value)
    row = await session.get(AppSetting, key)
    if row is None:
        session.add(
            AppSetting(
                key=key,
                value=sval,
                value_type="string",
                module="system",
                description="",
            )
        )
    else:
        row.value = sval
