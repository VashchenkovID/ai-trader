from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Instrument, ModelPerformance, TradingRequest


class PerformanceRepository:
    """Репозиторий аналитических срезов производительности."""

    async def list_sector_counts(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> list[tuple[str, int]]:
        stmt = (
            select(Instrument.sector, func.count(Instrument.id))
            .where(Instrument.sector.is_not(None))
            .group_by(Instrument.sector)
            .order_by(func.count(Instrument.id).desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await db_session.execute(stmt)).all()
        return [(str(row[0]), int(row[1])) for row in rows if row[0] is not None]

    async def count_sector_groups(self, db_session: AsyncSession) -> int:
        stmt = select(func.count(func.distinct(Instrument.sector))).where(Instrument.sector.is_not(None))
        value = await db_session.scalar(stmt)
        return int(value or 0)

    async def trading_request_count(self, db_session: AsyncSession) -> int:
        stmt = select(func.count(TradingRequest.id))
        value = await db_session.scalar(stmt)
        return int(value or 0)

    async def list_benchmarks(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 50,
    ) -> list[str]:
        stmt: Select[tuple[str]] = (
            select(ModelPerformance.benchmark)
            .where(ModelPerformance.benchmark.is_not(None))
            .distinct()
            .offset(offset)
            .limit(limit)
        )
        rows = (await db_session.execute(stmt)).all()
        return [str(row[0]) for row in rows if row[0] is not None]

    async def count_benchmarks(self, db_session: AsyncSession) -> int:
        stmt = select(func.count(func.distinct(ModelPerformance.benchmark))).where(
            ModelPerformance.benchmark.is_not(None)
        )
        value = await db_session.scalar(stmt)
        return int(value or 0)

    async def list_sectors(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> list[str]:
        stmt = (
            select(Instrument.sector)
            .where(Instrument.sector.is_not(None))
            .distinct()
            .order_by(Instrument.sector.asc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await db_session.execute(stmt)).all()
        return [str(row[0]) for row in rows if row[0] is not None]

    async def count_sectors(self, db_session: AsyncSession) -> int:
        return await self.count_sector_groups(db_session)
