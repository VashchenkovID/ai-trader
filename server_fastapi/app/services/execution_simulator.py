"""
Симуляция исполнения для paper/telemetry (TRACEABILITY: финальная версия — комиссия, налог, частичное).

Real-ордера не затрагиваются.
"""

from __future__ import annotations

from typing import Any


def simulate_fill_notional(
    *,
    notional_rub: float,
    spread_bps: float = 5.0,
    slippage_bps: float = 2.0,
) -> dict[str, Any]:
    """
    Оценка исполнения номинала: эффективная цена со сдвигом на половину спреда + slippage.
    """
    n = max(0.0, float(notional_rub))
    half_spread = float(spread_bps) * 1e-4 * 0.5
    slip = float(slippage_bps) * 1e-4
    friction = min(0.2, half_spread + slip)
    effective = n * (1.0 - friction) if n > 0 else 0.0
    return {
        "mode": "paper_simulation",
        "notionalRub": round(n, 4),
        "spreadBps": float(spread_bps),
        "slippageBps": float(slippage_bps),
        "frictionApprox": round(friction, 6),
        "effectiveNotionalRub": round(effective, 4),
        "formula": "notional * (1 - (spread_bps/2 + slippage_bps) * 1e-4)",
    }


def friction_bps(spread_bps: float = 5.0, slippage_bps: float = 2.0) -> float:
    return float(spread_bps) * 0.5 + float(slippage_bps)


def simulate_execution_detailed(
    *,
    notional_rub: float,
    spread_bps: float = 5.0,
    slippage_bps: float = 2.0,
    commission_pct: float = 0.05,
    tax_on_profit_pct: float = 13.0,
    fill_ratio: float = 1.0,
) -> dict[str, Any]:
    """
    Расширенная модель: комиссия от номинала, налог (упрощённо от прибыли не считаем — только поле),
    частичное исполнение fill_ratio in (0,1].
    """
    base = simulate_fill_notional(
        notional_rub=notional_rub, spread_bps=spread_bps, slippage_bps=slippage_bps
    )
    fr = max(0.0, min(1.0, float(fill_ratio)))
    after_liquidity = float(base["effectiveNotionalRub"]) * fr
    comm = after_liquidity * max(0.0, float(commission_pct)) / 100.0
    net = max(0.0, after_liquidity - comm)
    return {
        **base,
        "schemaVersion": 2,
        "fillRatio": fr,
        "commissionPct": float(commission_pct),
        "commissionRub": round(comm, 4),
        "netAfterCommissionRub": round(net, 4),
        "taxOnProfitPctReference": float(tax_on_profit_pct),
        "note": "tax применяется к реализованной прибыли вне этой модели",
    }


def log_metric_snapshot(**kwargs: Any) -> dict[str, Any]:
    return {"executionSimulator": "final_v2", **kwargs}
