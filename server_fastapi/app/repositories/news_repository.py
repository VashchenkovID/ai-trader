from datetime import datetime, timedelta

from sqlalchemy import Select, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_msk
from app.db.models import Instrument, NewsItem


class NewsRepository:
    """Репозиторий новостного домена."""

    async def count_and_last_update(self, db_session: AsyncSession) -> tuple[int, datetime | None]:
        stmt = select(func.count(NewsItem.id), func.max(NewsItem.published_at))
        row = (await db_session.execute(stmt)).one()
        return int(row[0] or 0), row[1]

    async def list_instruments(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> list[Instrument]:
        stmt: Select[tuple[Instrument]] = (
            select(Instrument).order_by(Instrument.ticker.asc()).offset(offset).limit(limit)
        )
        rows = await db_session.scalars(stmt)
        return list(rows)

    async def count_instruments(self, db_session: AsyncSession) -> int:
        value = await db_session.scalar(select(func.count(Instrument.id)))
        return int(value or 0)

    async def list_news_by_figi(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        offset: int,
        limit: int,
        days: int,
    ) -> list[NewsItem]:
        time_from = now_msk() - timedelta(days=days)
        stmt: Select[tuple[NewsItem]] = (
            select(NewsItem)
            .where(NewsItem.figi == figi, NewsItem.published_at >= time_from)
            .order_by(desc(NewsItem.published_at))
            .offset(offset)
            .limit(limit)
        )
        rows = await db_session.scalars(stmt)
        return list(rows)

    async def count_news_by_figi(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        days: int,
    ) -> int:
        time_from = now_msk() - timedelta(days=days)
        stmt = select(func.count(NewsItem.id)).where(
            NewsItem.figi == figi,
            NewsItem.published_at >= time_from,
        )
        value = await db_session.scalar(stmt)
        return int(value or 0)
