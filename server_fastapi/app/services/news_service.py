from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.news_repository import NewsRepository


class NewsService:
    """Сервис новостного домена через repository слой."""

    def __init__(self, repository: NewsRepository) -> None:
        self._repository = repository

    async def get_status(self, db_session: AsyncSession) -> dict[str, object]:
        try:
            records, last_update = await self._repository.count_and_last_update(db_session)
        except Exception:
            return {"initialized": False, "sources": [], "lastUpdateAt": None, "records": 0}
        return {
            "initialized": True,
            "sources": ["database"],
            "lastUpdateAt": last_update,
            "records": records,
        }

    async def get_instruments(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.list_instruments(db_session, offset=offset, limit=limit)
            total = await self._repository.count_instruments(db_session)
        except Exception:
            return [], 0
        return [{"figi": row.figi, "ticker": row.ticker, "name": row.name} for row in rows], total

    async def get_news(
        self,
        db_session: AsyncSession,
        figi: str,
        offset: int = 0,
        limit: int = 20,
        days: int = 30,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.list_news_by_figi(
                db_session,
                figi=figi,
                offset=offset,
                limit=limit,
                days=days,
            )
            total = await self._repository.count_news_by_figi(db_session, figi=figi, days=days)
        except Exception:
            return [], 0
        payload = [
            {
                "id": str(row.id),
                "figi": row.figi,
                "title": row.title,
                "summary": row.summary,
                "sentiment": row.sentiment,
                "publishedAt": row.published_at,
            }
            for row in rows
        ]
        return payload, total
