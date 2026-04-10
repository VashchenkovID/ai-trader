"""Подсказки после ручного исполнения real: сверка с операциями брокера (REWRITE §11 final)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)


def fetch_recent_operations_hint(client: Any, *, figi: str, hours: int = 72) -> dict[str, Any]:
    """
    Синхронно вызывает GetOperations за последние `hours` часов и возвращает сводку.
    Не меняет заявки — только телеметрия для оператора.
    """
    if client is None:
        return {"ok": False, "reason": "no_client"}
    try:
        now = datetime.now(timezone.utc)
        from_ts = (now - timedelta(hours=hours)).isoformat().replace("+00:00", "Z")
        to_ts = now.isoformat().replace("+00:00", "Z")
        data = client.get_operations(from_ts=from_ts, to_ts=to_ts)
    except Exception as e:
        logger.info("broker hint: get_operations failed: %s", e)
        return {"ok": False, "reason": str(e)}
    ops = data.get("operations") if isinstance(data, dict) else None
    n = len(ops) if isinstance(ops, list) else 0
    figi_l = str(figi).strip()
    matched = 0
    if isinstance(ops, list):
        for o in ops:
            if not isinstance(o, dict):
                continue
            if str(o.get("figi") or o.get("instrumentUid") or "") == figi_l:
                matched += 1
    return {
        "ok": True,
        "operationsTotal": n,
        "operationsMatchingFigi": matched,
        "windowHours": hours,
    }
