import asyncio
from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_msk
from app.core.errors import AppError
from app.db.models import TradingRequest
from app.repositories.market_repository import MarketRepository
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.risk_service import RiskService


def _to_dto(req: TradingRequest) -> dict[str, object]:
    """Преобразует ORM-модель в dict для API."""
    return {
        "id": req.id,
        "status": req.status,
        "figi": req.figi,
        "mode": req.mode,
        "action": req.action,
        "quantity": req.quantity,
        "price": req.price,
        "budget": req.budget,
        "createdAt": req.created_at,
        "updatedAt": req.updated_at,
        "approvedAt": req.approved_at,
        "executedAt": req.executed_at,
        "expiresAt": req.expires_at,
        "ticker": req.ticker,
        "name": req.name,
        "confidence": req.confidence,
        "score": req.score,
        "rejectReason": req.reject_reason,
        "actualPrice": req.actual_price,
        "actualAmount": req.actual_amount,
    }


_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "PENDING": {"APPROVED", "REJECTED", "CANCELLED", "EXPIRED"},
    "APPROVED": {"EXECUTED", "CANCELLED"},
    "REJECTED": set(),
    "EXECUTED": set(),
    "CANCELLED": set(),
    "EXPIRED": set(),
}


class TradingRequestService:
    """Сервис управления торговыми заявками с проверкой state machine."""

    _create_locks: dict[str, asyncio.Lock] = {}
    _locks_guard = asyncio.Lock()

    def __init__(
        self,
        trading_repo: TradingRequestRepository,
        market_repo: MarketRepository,
        risk_service: RiskService | None = None,
    ) -> None:
        self._trading_repo = trading_repo
        self._market_repo = market_repo
        self._risk_service = risk_service

    @classmethod
    async def _get_create_lock(cls, figi: str) -> asyncio.Lock:
        async with cls._locks_guard:
            lock = cls._create_locks.get(figi)
            if lock is None:
                lock = asyncio.Lock()
                cls._create_locks[figi] = lock
            return lock

    async def get_requests(
        self,
        db_session: AsyncSession,
        *,
        status: str | None = None,
        mode: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict[str, object]], int]:
        """Возвращает (items, total) заявок с пагинацией."""
        try:
            items, total = await self._trading_repo.list_requests(
                db_session, status=status, mode=mode, offset=offset, limit=limit
            )
            return [_to_dto(r) for r in items], total
        except Exception:
            return [], 0

    async def create_from_recommendation(
        self,
        db_session: AsyncSession,
        figi: str,
        *,
        action: str | None = None,
        mode: str = "paper",
        quantity: int | None = None,
    ) -> dict[str, object]:
        """Создает заявку из рекомендации в БД."""
        lock = await self._get_create_lock(figi)
        async with lock:
            rec = await self._market_repo.get_recommendation_by_figi(db_session, figi)
            if rec is None:
                raise AppError("RECOMMENDATION_NOT_FOUND", message=f"Рекомендация для FIGI {figi} не найдена")

            instrument = await self._market_repo.get_instrument_by_figi(db_session, figi)
            price = instrument.last_price if instrument and instrument.last_price else Decimal("0")
            if price <= 0:
                price = Decimal("1")
            qty = quantity if quantity is not None else 1
            if qty < 1:
                qty = 1
            act = action or rec.recommendation
            if act not in ("BUY", "SELL"):
                act = "BUY"
            budget = price * qty
            expires_at = now_msk() + timedelta(hours=4)

            active = await self._trading_repo.count_active_by_figi(db_session, figi=figi)
            if active > 0:
                raise AppError("CONFLICT", message="Уже есть активная заявка по этому FIGI")

            req = await self._trading_repo.create(
                db_session,
                figi=figi,
                mode=mode,
                action=act,
                quantity=qty,
                price=price,
                budget=budget,
                ticker=instrument.ticker if instrument else None,
                name=instrument.name if instrument else None,
                confidence=rec.confidence,
                score=rec.score,
                expires_at=expires_at,
            )
            return _to_dto(req)

    async def create_from_data(
        self,
        db_session: AsyncSession,
        data: dict,
        *,
        action: str | None = None,
        mode: str = "paper",
        quantity: int | None = None,
    ) -> dict[str, object]:
        """Создает заявку из переданных данных."""
        figi = data.get("figi") or data.get("recommendationFigi")
        if not figi:
            raise AppError("BAD_REQUEST", message="figi обязателен")
        rec_action = data.get("recommendation")
        if rec_action in ("BUY", "SELL"):
            act = action or rec_action
        else:
            act = action or "BUY"
        qty = quantity or data.get("quantity") or 1
        if qty < 1:
            qty = 1
        price = Decimal(str(data.get("price", 1)))
        if price <= 0:
            price = Decimal("1")
        budget = price * qty
        confidence = Decimal(str(data.get("confidence", 0.5))) if data.get("confidence") is not None else None
        score = Decimal(str(data.get("score", 0.5))) if data.get("score") is not None else None
        expires_at = now_msk() + timedelta(hours=4)

        instrument = await self._market_repo.get_instrument_by_figi(db_session, str(figi))
        ticker = instrument.ticker if instrument else data.get("ticker")
        name = instrument.name if instrument else data.get("name")

        figi_str = str(figi)
        lock = await self._get_create_lock(figi_str)
        async with lock:
            active = await self._trading_repo.count_active_by_figi(db_session, figi=figi_str)
            if active > 0:
                raise AppError("CONFLICT", message="Уже есть активная заявка по этому FIGI")

            req = await self._trading_repo.create(
                db_session,
                figi=figi_str,
                mode=mode,
                action=act,
                quantity=qty,
                price=price,
                budget=budget,
                ticker=str(ticker) if ticker else None,
                name=str(name) if name else None,
                confidence=confidence,
                score=score,
                expires_at=expires_at,
            )
            return _to_dto(req)

    def _check_transition(self, current: str, new_status: str) -> None:
        allowed = _ALLOWED_TRANSITIONS.get(current, set())
        if new_status not in allowed:
            raise AppError(
                "INVALID_STATE_TRANSITION",
                message=f"Переход {current} -> {new_status} недопустим",
                details={"current": current, "requested": new_status},
            )

    async def approve(
        self, db_session: AsyncSession, request_id: UUID, comment: str | None = None
    ) -> dict[str, object]:
        req = await self._trading_repo.get_by_id(db_session, request_id)
        if req is None:
            raise AppError("TRADING_REQUEST_NOT_FOUND")
        self._check_transition(req.status, "APPROVED")
        updated = await self._trading_repo.update_status(
            db_session,
            request_id,
            "APPROVED",
            approved_at=now_msk(),
        )
        return _to_dto(updated)

    async def reject(
        self, db_session: AsyncSession, request_id: UUID, reason: str
    ) -> dict[str, object]:
        req = await self._trading_repo.get_by_id(db_session, request_id)
        if req is None:
            raise AppError("TRADING_REQUEST_NOT_FOUND")
        self._check_transition(req.status, "REJECTED")
        updated = await self._trading_repo.update_status(
            db_session,
            request_id,
            "REJECTED",
            reject_reason=reason,
        )
        return _to_dto(updated)

    async def execute(
        self,
        db_session: AsyncSession,
        request_id: UUID,
        actual_price: Decimal | None = None,
        actual_amount: Decimal | None = None,
    ) -> dict[str, object]:
        req = await self._trading_repo.get_by_id(db_session, request_id)
        if req is None:
            raise AppError("TRADING_REQUEST_NOT_FOUND")
        self._check_transition(req.status, "EXECUTED")
        updated = await self._trading_repo.update_status(
            db_session,
            request_id,
            "EXECUTED",
            executed_at=now_msk(),
            actual_price=actual_price,
            actual_amount=actual_amount,
        )
        if self._risk_service is not None:
            expected = float(req.budget or 0)
            actual = float(actual_amount if actual_amount is not None else (req.budget or 0))
            self._risk_service.record_execution_result(pnl_delta=actual - expected)
        return _to_dto(updated)

    async def cancel(self, db_session: AsyncSession, request_id: UUID) -> dict[str, object]:
        req = await self._trading_repo.get_by_id(db_session, request_id)
        if req is None:
            raise AppError("TRADING_REQUEST_NOT_FOUND")
        self._check_transition(req.status, "CANCELLED")
        updated = await self._trading_repo.update_status(db_session, request_id, "CANCELLED")
        return _to_dto(updated)

    async def get_stats(
        self, db_session: AsyncSession, mode: str | None = None
    ) -> dict[str, object]:
        """Агрегаты по статусам заявок."""
        try:
            items, _ = await self._trading_repo.list_requests(
                db_session, status=None, mode=mode, offset=0, limit=10000
            )
            stats: dict[str, int] = {}
            for r in items:
                stats[r.status] = stats.get(r.status, 0) + 1
            return {"byStatus": stats, "total": len(items)}
        except Exception:
            return {"byStatus": {}, "total": 0}
