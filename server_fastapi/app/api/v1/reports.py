"""Сводные отчёты (TRACEABILITY: Daily reporting MVP)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Instrument, RealPortfolio, Recommendation, TradingRequest
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.execution_simulator import (
    log_metric_snapshot,
    simulate_execution_detailed,
    simulate_fill_notional,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily-summary", summary="Ежедневная сводка (стабильный payload)")
async def get_daily_summary(
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """
    Агрегаты по БД + снимок real_portfolio. Контракт фиксирован для дашбордов/CI smoke.
    """
    rec_n = await db_session.scalar(select(func.count(Recommendation.id)))
    inst_n = await db_session.scalar(select(func.count(Instrument.id)))
    tr_n = await db_session.scalar(select(func.count(TradingRequest.id)))
    pending_manual = await db_session.scalar(
        select(func.count(TradingRequest.id)).where(TradingRequest.status == "PENDING_MANUAL_REAL")
    )
    pending_open = await db_session.scalar(
        select(func.count(TradingRequest.id)).where(TradingRequest.status.in_(("PENDING", "APPROVED")))
    )
    rp = await db_session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1).limit(1))
    await db_session.commit()

    real_block = {
        "cached": rp is not None,
        "cash": float(rp.cash) if rp else None,
        "totalValue": float(rp.total_value) if rp else None,
        "positionsValue": float(rp.positions_value) if rp else None,
        "lastUpdated": rp.last_updated.isoformat() if rp and rp.last_updated else None,
    }
    return SuccessEnvelope(
        data={
            "schemaVersion": 2,
            "counts": {
                "recommendations": int(rec_n or 0),
                "instruments": int(inst_n or 0),
                "tradingRequests": int(tr_n or 0),
                "tradingRequestsPendingManualReal": int(pending_manual or 0),
                "tradingRequestsPendingOrApproved": int(pending_open or 0),
            },
            "realPortfolioSnapshot": real_block,
            "alertsSummary": {
                "manualRealAwaitingExecution": int(pending_manual or 0),
            },
        }
    )


@router.get("/execution-simulator-sample", summary="Пример метрик симуляции исполнения (MVP)")
async def get_execution_simulator_sample() -> SuccessEnvelope[dict]:
    """Детерминированный пример для TRACEABILITY / smoke; не влияет на ордера."""
    preview = simulate_fill_notional(notional_rub=100_000.0, spread_bps=5.0, slippage_bps=2.0)
    detailed = simulate_execution_detailed(
        notional_rub=100_000.0,
        spread_bps=5.0,
        slippage_bps=2.0,
        commission_pct=0.05,
        fill_ratio=1.0,
    )
    return SuccessEnvelope(
        data=log_metric_snapshot(preview=preview, detailed=detailed),
    )
