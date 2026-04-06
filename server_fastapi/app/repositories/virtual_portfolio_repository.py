"""Доступ к строке виртуального портфеля (singleton id=1)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import VirtualPortfolio


class VirtualPortfolioRepository:
    async def get_singleton(self, session: AsyncSession) -> VirtualPortfolio | None:
        return await session.scalar(select(VirtualPortfolio).where(VirtualPortfolio.id == 1).limit(1))
