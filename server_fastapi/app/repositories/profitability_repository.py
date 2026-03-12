from datetime import datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TradingRequest


class ProfitabilityRepository:
    """Репозиторий агрегатов прибыльности."""

    async def status_summary(self, db_session: AsyncSession) -> tuple[int, datetime | None]:
        stmt = select(func.count(TradingRequest.id), func.max(TradingRequest.updated_at))
        row = (await db_session.execute(stmt)).one()
        return int(row[0] or 0), row[1]

    async def pnl_aggregate(
        self,
        db_session: AsyncSession,
    ) -> tuple[Decimal, Decimal, int, int]:
        wins = ("EXECUTED",)
        losses = ("REJECTED", "CANCELLED", "EXPIRED")
        stmt = select(
            func.coalesce(
                func.sum(case((TradingRequest.status.in_(wins), TradingRequest.budget), else_=0)),
                0,
            ),
            func.coalesce(
                func.sum(case((TradingRequest.status.in_(losses), TradingRequest.budget), else_=0)),
                0,
            ),
            func.count(TradingRequest.id),
            func.sum(case((TradingRequest.status.in_(wins), 1), else_=0)),
        )
        row = (await db_session.execute(stmt)).one()
        return (
            Decimal(row[0] or 0),
            Decimal(row[1] or 0),
            int(row[2] or 0),
            int(row[3] or 0),
        )
