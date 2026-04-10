"""Доступ к строкам виртуального портфеля по профилю (REWRITE_CORE §13)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.virtual_profiles import DEFAULT_VIRTUAL_PROFILE, VIRTUAL_PROFILE_SLUGS
from app.db.models import VirtualPortfolio


class VirtualPortfolioRepository:
    async def get_by_profile(
        self, session: AsyncSession, profile_slug: str
    ) -> VirtualPortfolio | None:
        slug = profile_slug.strip().lower() if profile_slug else DEFAULT_VIRTUAL_PROFILE
        return await session.scalar(
            select(VirtualPortfolio).where(VirtualPortfolio.profile_slug == slug).limit(1)
        )

    async def list_all(self, session: AsyncSession) -> list[VirtualPortfolio]:
        rows = await session.scalars(
            select(VirtualPortfolio).order_by(VirtualPortfolio.profile_slug.asc())
        )
        return list(rows)

    async def get_singleton(self, session: AsyncSession) -> VirtualPortfolio | None:
        """Совместимость: основной профиль moderate."""
        return await self.get_by_profile(session, DEFAULT_VIRTUAL_PROFILE)

    @staticmethod
    def default_slugs() -> tuple[str, ...]:
        return VIRTUAL_PROFILE_SLUGS
