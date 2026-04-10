"""Упрощённые метрики по сделкам виртуального портфеля (REWRITE_CORE §12.2)."""

from __future__ import annotations

import math
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Any


def _parse_at(raw: object) -> datetime | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _days_ago_cutoff(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _sharpe_mdd_from_sorted_nav(
    points: list[tuple[date, float]],
) -> tuple[float | None, float | None]:
    """Дневные доходности по подряд идущим снимкам; Sharpe ~ sqrt(252), max drawdown по equity."""
    if len(points) < 3:
        return None, None
    vals = [float(p[1]) for p in points if p[1] is not None and float(p[1]) > 0]
    if len(vals) < 3:
        return None, None
    rets: list[float] = []
    for i in range(1, len(vals)):
        prev, cur = vals[i - 1], vals[i]
        if prev <= 0:
            continue
        rets.append((cur / prev) - 1.0)
    if len(rets) < 2:
        return None, None
    mu = statistics.mean(rets)
    sd = statistics.pstdev(rets)
    sharpe = (mu / sd) * math.sqrt(252.0) if sd > 1e-12 else None
    peak = vals[0]
    max_dd = 0.0
    for v in vals:
        peak = max(peak, v)
        if peak > 0:
            max_dd = max(max_dd, (peak - v) / peak)
    return (float(sharpe) if sharpe is not None else None, float(max_dd * 100.0))


def _filter_nav_window(
    points: list[tuple[date, float]],
    *,
    window_days: int,
) -> list[tuple[date, float]]:
    if not points:
        return []
    end = max(p[0] for p in points)
    start = end - timedelta(days=window_days)
    return sorted([p for p in points if p[0] >= start], key=lambda x: x[0])


def compute_nav_derived_metrics(
    nav_points: list[tuple[date, float]],
) -> dict[str, Any]:
    """Sharpe / max drawdown за 30 и 90 дней по ряду NAV (дата MSK/календарная)."""
    if len(nav_points) < 3:
        return {
            "sharpeAnnualized30d": None,
            "maxDrawdownPct30d": None,
            "sharpeAnnualized90d": None,
            "maxDrawdownPct90d": None,
            "navPointsUsed": len(nav_points),
        }
    w30 = _filter_nav_window(nav_points, window_days=30)
    w90 = _filter_nav_window(nav_points, window_days=90)
    s30, d30 = _sharpe_mdd_from_sorted_nav(w30)
    s90, d90 = _sharpe_mdd_from_sorted_nav(w90)
    return {
        "sharpeAnnualized30d": round(s30, 4) if s30 is not None else None,
        "maxDrawdownPct30d": round(d30, 4) if d30 is not None else None,
        "sharpeAnnualized90d": round(s90, 4) if s90 is not None else None,
        "maxDrawdownPct90d": round(d90, 4) if d90 is not None else None,
        "navPointsUsed": len(nav_points),
    }


def compute_trade_metrics(
    *,
    trades: list[Any],
    initial_capital: float,
    total_value: float,
    nav_points: list[tuple[date, float]] | None = None,
) -> dict[str, Any]:
    """
    Метрики по сделкам; при наличии дневного NAV — Sharpe и просадка за 30/90 дней.
    """
    ic = float(initial_capital) if initial_capital and initial_capital > 0 else 1.0
    tv = float(total_value) if total_value is not None else ic
    total_return_pct = (tv - ic) / ic * 100.0

    tlist = [t for t in trades if isinstance(t, dict)]
    n_all = len(tlist)
    cut30 = _days_ago_cutoff(30)
    cut90 = _days_ago_cutoff(90)

    def in_window(t: dict[str, Any], cut: datetime) -> bool:
        dt = _parse_at(t.get("at"))
        if dt is None:
            return False
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        cu = cut.replace(tzinfo=None) if cut.tzinfo else cut
        return dt >= cu

    n_30 = sum(1 for t in tlist if in_window(t, cut30))
    n_90 = sum(1 for t in tlist if in_window(t, cut90))

    sell_wins = 0
    sell_losses = 0
    pos_qty: dict[str, float] = {}
    pos_cost: dict[str, float] = {}

    tlist.sort(key=lambda x: str(x.get("at") or ""))
    for t in tlist:
        figi = str(t.get("figi") or "").strip()
        if not figi:
            continue
        action = str(t.get("action") or "").upper()
        q = float(t.get("quantity") or 0)
        amt = float(t.get("amount") or 0)
        if action == "BUY" and q > 0:
            pos_qty[figi] = pos_qty.get(figi, 0.0) + q
            pos_cost[figi] = pos_cost.get(figi, 0.0) + amt
        elif action == "SELL" and q > 0:
            basis = 0.0
            pq = pos_qty.get(figi, 0.0)
            if pq > 1e-9:
                avg = pos_cost.get(figi, 0.0) / pq
                sell_q = min(q, pq)
                basis = avg * sell_q
                pos_cost[figi] = pos_cost.get(figi, 0.0) - basis
                pos_qty[figi] = pq - sell_q
            pnl = amt - basis
            if pnl > 1e-6:
                sell_wins += 1
            elif pnl < -1e-6:
                sell_losses += 1

    closed = sell_wins + sell_losses
    win_rate_pct = (100.0 * sell_wins / closed) if closed > 0 else None

    note = "sharpe_and_drawdown_require_daily_nav_series"
    sharpe_a: float | None = None
    mdd: float | None = None
    nav_extra: dict[str, Any] = {}
    if nav_points and len(nav_points) >= 3:
        nav_extra = compute_nav_derived_metrics(nav_points)
        sharpe_a = nav_extra.get("sharpeAnnualized90d")
        mdd = nav_extra.get("maxDrawdownPct90d")
        note = "nav_snapshots_used"

    out: dict[str, Any] = {
        "totalReturnPct": round(total_return_pct, 4),
        "nTrades": n_all,
        "nTrades30d": n_30,
        "nTrades90d": n_90,
        "winRatePct": round(win_rate_pct, 2) if win_rate_pct is not None else None,
        "sellEventsForWinRate": closed,
        "sharpeAnnualized": sharpe_a,
        "maxDrawdownPct": mdd,
        "note": note,
    }
    out.update(nav_extra)
    return out
