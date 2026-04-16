from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Select, delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TradingRequest


class TradingRequestRepository:
    """Репозиторий торговых заявок (CRUD + агрегаты)."""

    async def list_requests(
        self,
        db_session: AsyncSession,
        *,
        status: str | None = None,
        mode: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[TradingRequest], int]:
        """Возвращает (items, total) с пагинацией."""
        base = select(TradingRequest)
        count_stmt = select(func.count(TradingRequest.id))

        if status:
            base = base.where(TradingRequest.status == status)
            count_stmt = count_stmt.where(TradingRequest.status == status)
        if mode:
            base = base.where(TradingRequest.mode == mode)
            count_stmt = count_stmt.where(TradingRequest.mode == mode)

        total = int((await db_session.scalar(count_stmt)) or 0)
        stmt: Select[tuple[TradingRequest]] = (
            base.order_by(desc(TradingRequest.created_at)).offset(offset).limit(limit)
        )
        rows = await db_session.scalars(stmt)
        return list(rows), total

    async def get_by_id(
        self, db_session: AsyncSession, request_id: UUID
    ) -> TradingRequest | None:
        stmt = select(TradingRequest).where(TradingRequest.id == request_id).limit(1)
        return await db_session.scalar(stmt)

    async def create(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        mode: str,
        action: str,
        quantity: int,
        price: Decimal,
        budget: Decimal,
        ticker: str | None = None,
        name: str | None = None,
        confidence: Decimal | None = None,
        score: Decimal | None = None,
        expires_at: datetime | None = None,
        virtual_profile_slug: str | None = None,
    ) -> TradingRequest:
        req = TradingRequest(
            status="PENDING",
            figi=figi,
            mode=mode,
            action=action,
            quantity=quantity,
            price=price,
            budget=budget,
            ticker=ticker,
            name=name,
            confidence=confidence,
            score=score,
            expires_at=expires_at,
            virtual_profile_slug=virtual_profile_slug,
        )
        db_session.add(req)
        await db_session.flush()
        await db_session.refresh(req)
        return req

    async def update_status(
        self,
        db_session: AsyncSession,
        request_id: UUID,
        new_status: str,
        *,
        approved_at: datetime | None = None,
        executed_at: datetime | None = None,
        reject_reason: str | None = None,
        actual_price: Decimal | None = None,
        actual_amount: Decimal | None = None,
    ) -> TradingRequest | None:
        req = await self.get_by_id(db_session, request_id)
        if not req:
            return None
        req.status = new_status
        if approved_at is not None:
            req.approved_at = approved_at
        if executed_at is not None:
            req.executed_at = executed_at
        if reject_reason is not None:
            req.reject_reason = reject_reason
        if actual_price is not None:
            req.actual_price = actual_price
        if actual_amount is not None:
            req.actual_amount = actual_amount
        await db_session.flush()
        await db_session.refresh(req)
        return req

    async def count_by_status_figi(
        self, db_session: AsyncSession, *, figi: str, status: str
    ) -> int:
        value = await db_session.scalar(
            select(func.count(TradingRequest.id)).where(
                TradingRequest.figi == figi,
                TradingRequest.status == status,
            )
        )
        return int(value or 0)

    async def count_active_by_figi(self, db_session: AsyncSession, *, figi: str) -> int:
        """Количество активных заявок по FIGI (ожидают решения или исполнения)."""
        value = await db_session.scalar(
            select(func.count(TradingRequest.id)).where(
                TradingRequest.figi == figi,
                TradingRequest.status.in_(("PENDING", "APPROVED", "PENDING_MANUAL_REAL")),
            )
        )
        return int(value or 0)

    async def count_active_by_figi_and_profile(
        self,
        db_session: AsyncSession,
        *,
        figi: str,
        virtual_profile_slug: str,
    ) -> int:
        """Активные заявки по паре FIGI + виртуальный профиль (§13 multi-slug)."""
        value = await db_session.scalar(
            select(func.count(TradingRequest.id)).where(
                TradingRequest.figi == figi,
                TradingRequest.virtual_profile_slug == virtual_profile_slug,
                TradingRequest.status.in_(("PENDING", "APPROVED", "PENDING_MANUAL_REAL")),
            )
        )
        return int(value or 0)

    async def expire_overdue(self, db_session: AsyncSession, now: datetime) -> int:
        """Переводит просроченные заявки PENDING в EXPIRED."""
        from sqlalchemy import update
        stmt = (
            update(TradingRequest)
            .where(
                TradingRequest.status == "PENDING",
                TradingRequest.expires_at <= now,
            )
            .values(status="EXPIRED", reject_reason="Request has expired")
        )
        res = await db_session.execute(stmt)
        return int(res.rowcount or 0)

    async def sum_reserved_buy_budget_real_accounts(self, db_session: AsyncSession) -> Decimal:
        """
        Сумма budget по BUY-заявкам real/micro в статусах, где сделка ещё не исполнена в приложении,
        но средства считаются зарезервированными под исполнение.
        """
        stmt = select(func.coalesce(func.sum(TradingRequest.budget), 0)).where(
            TradingRequest.status.in_(("APPROVED", "PENDING_MANUAL_REAL")),
            func.upper(TradingRequest.action) == "BUY",
            func.lower(TradingRequest.mode).in_(("real", "micro")),
        )
        raw = await db_session.scalar(stmt)
        if raw is None:
            return Decimal("0")
        return Decimal(str(raw))

    async def delete_not_pending(
        self,
        db_session: AsyncSession,
        *,
        mode: str | None = None,
    ) -> int:
        """Удаляет завершённые заявки; сохраняет PENDING и PENDING_MANUAL_REAL."""
        stmt = delete(TradingRequest).where(
            TradingRequest.status.notin(("PENDING", "PENDING_MANUAL_REAL"))
        )
        if mode:
            stmt = stmt.where(TradingRequest.mode == mode)
        res = await db_session.execute(stmt)
        return int(res.rowcount or 0)
