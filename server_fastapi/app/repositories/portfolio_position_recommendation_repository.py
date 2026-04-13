from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PortfolioPositionRecommendation


class PortfolioPositionRecommendationRepository:
    async def add_row(
        self,
        session: AsyncSession,
        *,
        portfolio_scope: str,
        figi: str,
        analysis_run_id: UUID,
        market_score: Decimal | None,
        market_confidence: Decimal | None,
        final_action: str,
        final_confidence: Decimal,
        position_snapshot: dict,
        llm_payload: dict | None = None,
        raw_llm_text: str | None = None,
    ) -> PortfolioPositionRecommendation:
        row = PortfolioPositionRecommendation(
            portfolio_scope=portfolio_scope,
            figi=figi,
            analysis_run_id=analysis_run_id,
            market_score=market_score,
            market_confidence=market_confidence,
            final_action=final_action,
            final_confidence=final_confidence,
            position_snapshot=position_snapshot,
            llm_payload=llm_payload,
            raw_llm_text=raw_llm_text,
        )
        session.add(row)
        await session.flush()
        return row

    async def list_recent(
        self,
        session: AsyncSession,
        *,
        portfolio_scope: str,
        limit: int = 200,
    ) -> list[PortfolioPositionRecommendation]:
        stmt = (
            select(PortfolioPositionRecommendation)
            .where(PortfolioPositionRecommendation.portfolio_scope == portfolio_scope)
            .order_by(desc(PortfolioPositionRecommendation.created_at))
            .limit(max(1, min(limit, 2000)))
        )
        return list((await session.scalars(stmt)).all())

    async def latest_by_figi_map(
        self,
        session: AsyncSession,
        *,
        portfolio_scope: str,
    ) -> dict[str, PortfolioPositionRecommendation]:
        """Последняя запись по каждому FIGI (по времени created_at)."""
        rows = await self.list_recent(session, portfolio_scope=portfolio_scope, limit=2000)
        out: dict[str, PortfolioPositionRecommendation] = {}
        for r in rows:
            if r.figi not in out:
                out[r.figi] = r
        return out
