from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.market_repository import MarketRepository


class MarketService:
    """Сервис read-операций рыночного домена через явный repository слой."""

    def __init__(self, repository: MarketRepository) -> None:
        self._repository = repository

    async def get_instruments(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            items = await self._repository.list_instruments(db_session, offset=offset, limit=limit)
            total = await self._repository.count_instruments(db_session)
        except Exception:
            return [], 0
        payload = [
            {
                "figi": item.figi,
                "ticker": item.ticker,
                "name": item.name,
                "sector": item.sector,
                "currency": item.currency,
                "lastPrice": item.last_price,
            }
            for item in items
        ]
        return payload, total

    async def get_recommendations(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.list_recommendations(db_session, offset=offset, limit=limit)
            total = await self._repository.count_recommendations(db_session)
        except Exception:
            return [], 0
        payload = [
            {
                "figi": row.figi,
                "recommendation": row.recommendation,
                "confidence": row.confidence,
                "score": row.score,
                "analysisDate": row.analysis_date,
                "llmJuryPayload": getattr(row, "llm_jury_payload", None),
            }
            for row in rows
        ]
        return payload, total

    async def get_stock(self, db_session: AsyncSession, figi: str) -> dict[str, object] | None:
        try:
            row = await self._repository.get_instrument_by_figi(db_session, figi)
        except Exception:
            return None
        if row is None:
            return None
        payload = {
            "figi": row.figi,
            "ticker": row.ticker,
            "name": row.name,
            "sector": row.sector,
            "currency": row.currency,
            "currentPrice": row.last_price,
            "lastPrice": row.last_price,
            "lot": row.lot,
        }
        payload["dividendYield"] = None
        payload["lastPriceTime"] = None
        return payload

    async def get_candles(
        self,
        db_session: AsyncSession,
        figi: str,
        offset: int = 0,
        limit: int = 30,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.get_candles_by_figi(
                db_session,
                figi=figi,
                offset=offset,
                limit=limit,
            )
            total = await self._repository.count_candles_by_figi(db_session, figi=figi)
        except Exception:
            return [], 0
        payload = [
            {
                "time": row.candle_time,
                "open": row.open,
                "high": row.high,
                "low": row.low,
                "close": row.close,
                "volume": row.volume,
            }
            for row in rows
        ]
        return payload, total
