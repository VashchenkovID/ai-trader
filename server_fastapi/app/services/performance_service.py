from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.performance_repository import PerformanceRepository


class PerformanceService:
    """Сервис аналитических read-срезов через repository слой."""

    def __init__(self, repository: PerformanceRepository) -> None:
        self._repository = repository

    async def get_sector_analysis(
        self,
        db_session: AsyncSession,
        *,
        days: int,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.list_sector_counts(db_session, offset=offset, limit=limit)
            total = await self._repository.count_sector_groups(db_session)
        except Exception:
            return [], 0
        return [{"sector": sector, "instrumentCount": count, "days": days} for sector, count in rows], total

    async def get_dashboard(
        self,
        db_session: AsyncSession,
        period: int,
        strategy: str | None,
        sector: str | None,
    ) -> dict[str, object]:
        try:
            request_count = await self._repository.trading_request_count(db_session)
        except Exception:
            request_count = 0
        return {
            "period": period,
            "strategy": strategy,
            "sector": sector,
            "summary": {
                "requestCount": request_count,
                "sharpe": None,
                "maxDrawdownPct": None,
            },
        }

    async def get_benchmark_list(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.list_benchmarks(db_session, offset=offset, limit=limit)
            total = await self._repository.count_benchmarks(db_session)
        except Exception:
            return [], 0
        return [{"id": benchmark, "name": benchmark.upper()} for benchmark in rows], total

    async def get_sectors(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[str], int]:
        try:
            items = await self._repository.list_sectors(db_session, offset=offset, limit=limit)
            total = await self._repository.count_sectors(db_session)
            return items, total
        except Exception:
            return [], 0
