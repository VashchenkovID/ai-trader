import asyncio
from datetime import timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.time_utils import now_msk
from app.core.errors import AppError
from app.core.config import get_settings
from app.db.models import AppSetting
from app.db.models import TradingRequest
from app.repositories.market_repository import MarketRepository
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.risk_service import RiskService
from app.services.virtual_portfolio_service import VirtualPortfolioService


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


def _ensure_figi_allowed_for_trading(figi: str) -> None:
    """Если ALLOW_SYNTHETIC_TRADING_FIGI=false, запрещаем префикс TEST- (интеграционные FIGI)."""
    if get_settings().allow_synthetic_trading_figi:
        return
    f = str(figi).strip().upper()
    if f.startswith("TEST-"):
        raise AppError(
            "BUSINESS_RULE_VIOLATION",
            message="Синтетические FIGI (префикс TEST-) отключены настройкой. Укажите реальный FIGI из справочника инструментов.",
        )


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
        virtual_portfolio_service: VirtualPortfolioService | None = None,
    ) -> None:
        self._trading_repo = trading_repo
        self._market_repo = market_repo
        self._risk_service = risk_service
        self._virtual_portfolio_service = virtual_portfolio_service

    async def _read_app_setting_str(
        self, db_session: AsyncSession, key: str, fallback: str
    ) -> str:
        if db_session is None or not hasattr(db_session, "execute"):
            return fallback
        try:
            row = await db_session.scalar(
                select(AppSetting.value).where(AppSetting.key == key).limit(1)
            )
            value = str(row).strip() if row is not None else ""
            return value or fallback
        except Exception:
            return fallback

    async def _compute_default_quantity(
        self,
        db_session: AsyncSession,
        *,
        mode: str,
        action: str,
        price: Decimal,
        figi: str | None = None,
    ) -> int:
        """
        Quantity по умолчанию, если клиент/пайплайн не передал quantity.
        Для BUY — из risk.maxPositionSize и доступного капитала.
        Для SELL — объём позиции в виртуальном портфеле (полное закрытие), иначе 0.
        """
        act = (action or "BUY").upper()
        if act == "SELL":
            if figi and self._virtual_portfolio_service is not None:
                held = await self._virtual_portfolio_service.get_position_quantity(
                    db_session, figi
                )
                return held if held >= 1 else 0
            return 0
        if act != "BUY":
            return 1
        if price <= 0:
            return 1

        # risk.maxPositionSize (доля капитала на позицию) хранится в app_settings как строка.
        max_pos_raw = await self._read_app_setting_str(db_session, "risk.maxPositionSize", "0.1")
        try:
            max_pos = Decimal(max_pos_raw)
        except Exception:
            max_pos = Decimal("0.1")
        if max_pos <= 0:
            max_pos = Decimal("0.1")
        if max_pos > 1:
            max_pos = Decimal("1")

        capital: Decimal
        if mode == "paper":
            used_vp_cash = False
            if self._virtual_portfolio_service is not None:
                cash_vp = await self._virtual_portfolio_service.get_available_cash_for_sizing(db_session)
                if cash_vp is not None and cash_vp > 0:
                    capital = cash_vp
                    used_vp_cash = True
            if not used_vp_cash:
                capital_raw = await self._read_app_setting_str(
                    db_session, "portfolio.virtual.initial_capital", "1000000"
                )
                try:
                    capital = Decimal(capital_raw)
                except Exception:
                    capital = Decimal("1000000")
        else:
            # Для real без доступа к реальному портфелю используем безопасный дефолт.
            capital = Decimal("1000000")

        if capital <= 0:
            capital = Decimal("1000000")

        budget = capital * max_pos
        qty = int(budget // price)
        return qty if qty >= 1 else 1

    async def _compute_order_from_recommendation(
        self,
        db_session: AsyncSession,
        figi: str,
        *,
        action: str | None,
        mode: str,
        quantity: int | None,
        confidence_override: Decimal | None = None,
        score_override: Decimal | None = None,
    ) -> dict[str, Any]:
        """Поля заявки из строки рекомендации в БД (без записи)."""
        _ensure_figi_allowed_for_trading(figi)
        rec = await self._market_repo.get_recommendation_by_figi(db_session, figi)
        if rec is None:
            raise AppError("RECOMMENDATION_NOT_FOUND", message=f"Рекомендация для FIGI {figi} не найдена")

        instrument = await self._market_repo.get_instrument_by_figi(db_session, figi)
        price = instrument.last_price if instrument and instrument.last_price else Decimal("0")
        if price <= 0:
            price = Decimal("1")
        act = action or rec.recommendation
        if act not in ("BUY", "SELL"):
            act = "BUY"
        qty = (
            int(quantity)
            if quantity is not None and int(quantity) >= 1
            else await self._compute_default_quantity(
                db_session, mode=mode, action=act, price=price, figi=figi
            )
        )
        if qty < 1:
            if act == "SELL":
                raise AppError(
                    "BUSINESS_RULE_VIOLATION",
                    message="Нет позиции в виртуальном портфеле для продажи по этому инструменту",
                )
            qty = 1
        budget = price * qty
        conf = confidence_override if confidence_override is not None else rec.confidence
        scr = score_override if score_override is not None else rec.score
        return {
            "figi": figi,
            "action": act,
            "mode": mode,
            "quantity": qty,
            "price": price,
            "budget": budget,
            "ticker": instrument.ticker if instrument else None,
            "name": instrument.name if instrument else None,
            "confidence": conf,
            "score": scr,
            "recommendation": str(rec.recommendation),
        }

    async def _compute_order_from_data(
        self,
        db_session: AsyncSession,
        data: dict,
        *,
        action: str | None,
        mode: str,
        quantity: int | None,
    ) -> dict[str, Any]:
        """Поля заявки из переданного словаря (без записи)."""
        figi = data.get("figi") or data.get("recommendationFigi")
        if not figi:
            raise AppError("BAD_REQUEST", message="figi обязателен")
        _ensure_figi_allowed_for_trading(str(figi))
        rec_action = data.get("recommendation")
        if rec_action in ("BUY", "SELL"):
            act = action or rec_action
        else:
            act = action or "BUY"
        price = Decimal(str(data.get("price", 1)))
        if price <= 0:
            price = Decimal("1")
        figi_str = str(figi)
        qty_raw = quantity if quantity is not None else data.get("quantity")
        qty = int(qty_raw) if qty_raw is not None and int(qty_raw) >= 1 else 0
        if qty < 1:
            qty = await self._compute_default_quantity(
                db_session, mode=mode, action=act, price=price, figi=figi_str
            )
        if qty < 1:
            if act == "SELL":
                raise AppError(
                    "BUSINESS_RULE_VIOLATION",
                    message="Нет позиции в виртуальном портфеле для продажи по этому инструменту",
                )
            qty = 1
        budget = price * qty
        confidence = Decimal(str(data.get("confidence", 0.5))) if data.get("confidence") is not None else None
        score = Decimal(str(data.get("score", 0.5))) if data.get("score") is not None else None
        instrument = await self._market_repo.get_instrument_by_figi(db_session, figi_str)
        ticker = instrument.ticker if instrument else data.get("ticker")
        name = instrument.name if instrument else data.get("name")
        return {
            "figi": figi_str,
            "action": act,
            "mode": mode,
            "quantity": qty,
            "price": price,
            "budget": budget,
            "ticker": str(ticker) if ticker else None,
            "name": str(name) if name else None,
            "confidence": confidence,
            "score": score,
            "recommendation": str(rec_action) if rec_action else "—",
        }

    async def preview_trade(
        self,
        db_session: AsyncSession,
        *,
        recommendation_figi: str | None,
        recommendation_data: dict | None,
        action: str | None,
        mode: str,
        quantity: int | None,
    ) -> dict[str, object]:
        """Предрасчёт заявки без записи; при ошибке валидации — ok=false."""
        try:
            if recommendation_figi:
                fields = await self._compute_order_from_recommendation(
                    db_session,
                    recommendation_figi,
                    action=action,
                    mode=mode,
                    quantity=quantity,
                )
            elif recommendation_data:
                fields = await self._compute_order_from_data(
                    db_session,
                    recommendation_data,
                    action=action,
                    mode=mode,
                    quantity=quantity,
                )
            else:
                raise AppError("BAD_REQUEST", message="Требуется recommendationFigi или recommendationData")

            figi_key = str(fields["figi"])
            active = await self._trading_repo.count_active_by_figi(db_session, figi=figi_key)
            price = fields["price"]
            budget = fields["budget"]
            conf = fields["confidence"]
            score = fields["score"]
            return {
                "ok": True,
                "figi": figi_key,
                "action": fields["action"],
                "mode": fields["mode"],
                "quantity": fields["quantity"],
                "price": float(price) if isinstance(price, Decimal) else float(price),
                "budget": float(budget) if isinstance(budget, Decimal) else float(budget),
                "ticker": fields["ticker"],
                "name": fields["name"],
                "recommendation": fields["recommendation"],
                "confidence": float(conf) if conf is not None else None,
                "score": float(score) if score is not None else None,
                "hasActiveRequest": active > 0,
            }
        except AppError as e:
            return {
                "ok": False,
                "errorCode": e.error_code,
                "message": e.message,
            }

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
        confidence_override: Decimal | None = None,
        score_override: Decimal | None = None,
    ) -> dict[str, object]:
        """Создает заявку из рекомендации в БД."""
        lock = await self._get_create_lock(figi)
        async with lock:
            fields = await self._compute_order_from_recommendation(
                db_session,
                figi,
                action=action,
                mode=mode,
                quantity=quantity,
                confidence_override=confidence_override,
                score_override=score_override,
            )
            expires_at = now_msk() + timedelta(hours=4)

            active = await self._trading_repo.count_active_by_figi(db_session, figi=figi)
            if active > 0:
                raise AppError("CONFLICT", message="Уже есть активная заявка по этому FIGI")

            req = await self._trading_repo.create(
                db_session,
                figi=fields["figi"],
                mode=fields["mode"],
                action=fields["action"],
                quantity=fields["quantity"],
                price=fields["price"],
                budget=fields["budget"],
                ticker=fields["ticker"],
                name=fields["name"],
                confidence=fields["confidence"],
                score=fields["score"],
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
        fields = await self._compute_order_from_data(
            db_session, data, action=action, mode=mode, quantity=quantity
        )
        figi_str = str(fields["figi"])
        expires_at = now_msk() + timedelta(hours=4)

        lock = await self._get_create_lock(figi_str)
        async with lock:
            active = await self._trading_repo.count_active_by_figi(db_session, figi=figi_str)
            if active > 0:
                raise AppError("CONFLICT", message="Уже есть активная заявка по этому FIGI")

            req = await self._trading_repo.create(
                db_session,
                figi=figi_str,
                mode=fields["mode"],
                action=fields["action"],
                quantity=fields["quantity"],
                price=fields["price"],
                budget=fields["budget"],
                ticker=fields["ticker"],
                name=fields["name"],
                confidence=fields["confidence"],
                score=fields["score"],
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
        await self._trading_repo.update_status(
            db_session,
            request_id,
            "APPROVED",
            approved_at=now_msk(),
        )
        # Paper: исполнение сразу по цене/сумме заявки — иначе виртуальный портфель не меняется до отдельного «Исполнить».
        if str(req.mode or "").lower() == "paper":
            return await self.execute(
                db_session,
                request_id,
                actual_price=req.price,
                actual_amount=req.budget,
            )
        updated = await self._trading_repo.get_by_id(db_session, request_id)
        return _to_dto(updated) if updated else {}

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
        if req.mode == "paper" and self._virtual_portfolio_service is not None:
            await self._virtual_portfolio_service.apply_paper_execution(
                db_session,
                updated,
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

    async def delete_completed(
        self,
        db_session: AsyncSession,
        *,
        mode: str | None = None,
    ) -> dict[str, object]:
        """Удаляет все заявки, которые не в статусе PENDING."""
        deleted = await self._trading_repo.delete_not_pending(db_session, mode=mode)
        return {"deleted": deleted, "mode": mode}
