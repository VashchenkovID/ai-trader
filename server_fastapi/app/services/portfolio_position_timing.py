"""
Дата входа в позицию и длительность удержания для портфельного анализа.

Виртуальный портфель: FIFO по сделкам из `VirtualPortfolio.trades`.
Реальный счёт: те же правила по операциям GetOperations (BUY/SELL), если удаётся разобрать тип и объём.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Any

from app.core.time_utils import get_server_tz, now_msk


def parse_iso_datetime(value: str | None) -> datetime | None:
    """Разбор ISO-строки (в т.ч. с Z); naive → часовой пояс сервера."""
    s = (value or "").strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=get_server_tz())
    return dt


def fifo_first_buy_at(figi: str, trades: list[dict[str, Any]]) -> datetime | None:
    """
    По хронологии сделок BUY/SELL для FIGI — дата самого раннего лота,
    входящего в **текущую** позицию (FIFO).
    """
    figi_s = str(figi).strip()
    rows = sorted(
        (t for t in trades if isinstance(t, dict) and str(t.get("figi") or "").strip() == figi_s),
        key=lambda t: str(t.get("at") or ""),
    )
    lots: deque[tuple[datetime, int]] = deque()
    for t in rows:
        dt = parse_iso_datetime(str(t.get("at") or ""))
        if dt is None:
            continue
        action = str(t.get("action") or "").upper()
        try:
            q = int(t.get("quantity") or 0)
        except (TypeError, ValueError):
            continue
        if q <= 0:
            continue
        if action == "BUY":
            lots.append((dt, q))
        elif action == "SELL":
            rem = q
            while rem > 0 and lots:
                bt, bq = lots[0]
                take = min(rem, bq)
                bq -= take
                rem -= take
                if bq <= 0:
                    lots.popleft()
                else:
                    lots[0] = (bt, bq)
    if not lots:
        return None
    return min(bt for bt, _ in lots)


def days_in_position_calendar(first: datetime | None, end: datetime | None = None) -> int | None:
    """Календарные дни удержания в TZ сервера; при отсутствии даты входа — None."""
    if first is None:
        return None
    end_dt = end if end is not None else now_msk()
    st = first.astimezone(get_server_tz()).date()
    en = end_dt.astimezone(get_server_tz()).date()
    return max(0, (en - st).days)


def first_buy_iso_for_json(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(get_server_tz()).isoformat()


def _tinkoff_op_type_action(operation_type: str) -> str | None:
    u = (operation_type or "").upper()
    if not u:
        return None
    if "OPERATION_TYPE_SELL" in u or u.endswith("_SELL"):
        return "SELL"
    if "BUY" in u and "SELL" not in u:
        return "BUY"
    return None


def _tinkoff_operation_quantity(op: dict[str, Any]) -> int:
    q = op.get("quantity")
    if isinstance(q, dict):
        try:
            units = int(q.get("units", 0) or 0)
            return abs(units)
        except (TypeError, ValueError):
            return 0
    if q is None:
        # иногда объём в сделках операции
        trs = op.get("trades")
        if isinstance(trs, list) and trs:
            total = 0
            for tr in trs:
                if not isinstance(tr, dict):
                    continue
                tq = tr.get("quantity")
                if isinstance(tq, dict):
                    try:
                        total += abs(int(tq.get("units", 0) or 0))
                    except (TypeError, ValueError):
                        pass
            return total
        return 0
    try:
        return abs(int(q))
    except (TypeError, ValueError):
        return 0


def tinkoff_operations_to_trade_likes(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    """
    Преобразует ответ GetOperations в список {figi, action, quantity, at} для FIFO.
    Неполные/непонятные операции пропускаются.
    """
    if not isinstance(data, dict):
        return []
    out: list[dict[str, Any]] = []
    for op in data.get("operations") or []:
        if not isinstance(op, dict):
            continue
        figi = str(op.get("figi") or "").strip()
        if not figi:
            continue
        ot = str(op.get("operationType") or op.get("type") or "")
        act = _tinkoff_op_type_action(ot)
        if act is None:
            continue
        qty = _tinkoff_operation_quantity(op)
        if qty <= 0:
            continue
        date_raw = op.get("date")
        if date_raw is None:
            continue
        if isinstance(date_raw, dict):
            # protobuf Timestamp JSON
            secs = date_raw.get("seconds")
            if secs is not None:
                try:
                    dt = datetime.fromtimestamp(int(secs), tz=timezone.utc)
                    at_s = dt.isoformat().replace("+00:00", "Z")
                except (TypeError, ValueError, OSError):
                    continue
            else:
                continue
        else:
            at_s = str(date_raw).strip()
        if not at_s:
            continue
        out.append({"figi": figi, "action": act, "quantity": qty, "at": at_s})
    out.sort(key=lambda x: str(x.get("at") or ""))
    return out
