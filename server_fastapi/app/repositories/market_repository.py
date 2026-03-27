from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, desc, select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_msk
from app.db.models import Candle, Instrument, Recommendation, Signal


class MarketRepository:
    """Репозиторий рыночных данных (инструменты, рекомендации, свечи)."""

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

    async def list_recommendations(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> list[Recommendation]:
        stmt: Select[tuple[Recommendation]] = (
            select(Recommendation)
            .order_by(desc(Recommendation.analysis_date))
            .offset(offset)
            .limit(limit)
        )
        rows = await db_session.scalars(stmt)
        return list(rows)

    async def list_recommendations_with_instrument(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> list[tuple[Recommendation, str | None, str | None, Decimal | None]]:
        stmt: Select[tuple[Recommendation, str | None, str | None, Decimal | None]] = (
            select(Recommendation, Instrument.ticker, Instrument.name, Instrument.last_price)
            .outerjoin(Instrument, Instrument.figi == Recommendation.figi)
            .order_by(desc(Recommendation.analysis_date))
            .offset(offset)
            .limit(limit)
        )
        rows = await db_session.execute(stmt)
        return list(rows.all())

    async def count_recommendations(self, db_session: AsyncSession) -> int:
        value = await db_session.scalar(select(func.count(Recommendation.id)))
        return int(value or 0)

    async def get_instrument_by_figi(self, db_session: AsyncSession, figi: str) -> Instrument | None:
        stmt: Select[tuple[Instrument]] = select(Instrument).where(Instrument.figi == figi).limit(1)
        return await db_session.scalar(stmt)

    async def get_recommendation_by_figi(
        self, db_session: AsyncSession, figi: str
    ) -> Recommendation | None:
        """Возвращает последнюю рекомендацию по FIGI."""
        stmt = (
            select(Recommendation)
            .where(Recommendation.figi == figi)
            .order_by(desc(Recommendation.analysis_date))
            .limit(1)
        )
        return await db_session.scalar(stmt)

    async def upsert_recommendation(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        recommendation: str,
        confidence: Decimal,
        score: Decimal,
        analysis_date: datetime | None = None,
        llm_jury_payload: dict | None = None,
        nn_score: Decimal | None = None,
        nn_confidence: Decimal | None = None,
        nn_checkpoint: str | None = None,
        nn_payload: dict | None = None,
    ) -> Recommendation:
        existing = await self.get_recommendation_by_figi(db_session, figi)
        if existing:
            existing.recommendation = recommendation
            existing.confidence = confidence
            existing.score = score
            if analysis_date is not None:
                existing.analysis_date = analysis_date
            if llm_jury_payload is not None:
                existing.llm_jury_payload = llm_jury_payload
            if nn_score is not None:
                existing.nn_score = nn_score
            if nn_confidence is not None:
                existing.nn_confidence = nn_confidence
            if nn_checkpoint is not None:
                existing.nn_checkpoint = nn_checkpoint
            if nn_payload is not None:
                existing.nn_payload = nn_payload
            await db_session.flush()
            return existing
        row = Recommendation(
            figi=figi,
            recommendation=recommendation,
            confidence=confidence,
            score=score,
            analysis_date=analysis_date,
            llm_jury_payload=llm_jury_payload,
            nn_score=nn_score,
            nn_confidence=nn_confidence,
            nn_checkpoint=nn_checkpoint,
            nn_payload=nn_payload,
        )
        db_session.add(row)
        await db_session.flush()
        return row

    async def update_recommendation_weekly_forecast(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        payload: dict[str, Any],
    ) -> None:
        """Сохраняет JSON weekly-прогноза в последнюю рекомендацию по FIGI."""
        row = await self.get_recommendation_by_figi(db_session, figi)
        if row is None:
            return
        row.weekly_forecast = payload
        row.weekly_forecast_at = now_msk()
        await db_session.flush()

    async def get_candles_by_figi(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        offset: int = 0,
        limit: int,
    ) -> list[Candle]:
        stmt: Select[tuple[Candle]] = (
            select(Candle)
            .where(Candle.figi == figi)
            .order_by(desc(Candle.candle_time))
            .offset(offset)
            .limit(limit)
        )
        rows = list(await db_session.scalars(stmt))
        rows.reverse()
        return rows

    async def count_candles_by_figi(self, db_session: AsyncSession, *, figi: str) -> int:
        value = await db_session.scalar(select(func.count(Candle.id)).where(Candle.figi == figi))
        return int(value or 0)

    async def list_signals_by_figi(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        ticker: str | None = None,
        limit: int = 100,
    ) -> list[Signal]:
        """Сигналы аналитиков: сначала по FIGI, при пустом результате — по тикеру."""
        stmt = (
            select(Signal)
            .where(Signal.figi == figi)
            .order_by(desc(Signal.synced_at))
            .limit(limit)
        )
        rows = list(await db_session.scalars(stmt))
        if rows:
            return rows
        if ticker:
            stmt_t = (
                select(Signal)
                .where(Signal.ticker == ticker.upper())
                .order_by(desc(Signal.synced_at))
                .limit(limit)
            )
            return list(await db_session.scalars(stmt_t))
        return []

    async def upsert_instrument(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        ticker: str,
        name: str,
        currency: str = "RUB",
        sector: str | None = None,
        lot: int = 1,
        last_price: float | None = None,
    ) -> Instrument:
        """Вставить или обновить инструмент по FIGI."""
        existing = await self.get_instrument_by_figi(db_session, figi)
        if existing:
            existing.ticker = ticker
            existing.name = name
            existing.currency = currency
            if sector is not None:
                existing.sector = sector
            existing.lot = lot
            if last_price is not None:
                existing.last_price = last_price
            await db_session.flush()
            return existing
        inst = Instrument(
            figi=figi,
            ticker=ticker,
            name=name,
            currency=currency,
            sector=sector,
            lot=lot,
            last_price=last_price,
        )
        db_session.add(inst)
        await db_session.flush()
        return inst

    async def list_figi(self, db_session: AsyncSession, *, limit: int = 5000) -> list[str]:
        """Список FIGI инструментов (для обновления цен)."""
        stmt = select(Instrument.figi).limit(limit)
        rows = await db_session.scalars(stmt)
        return list(rows)

    async def update_last_price(
        self, db_session: AsyncSession, *, figi: str, last_price: float
    ) -> None:
        """Обновить последнюю цену инструмента."""
        stmt = select(Instrument).where(Instrument.figi == figi).limit(1)
        inst = await db_session.scalar(stmt)
        if inst:
            inst.last_price = last_price
            await db_session.flush()
