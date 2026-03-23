from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_msk
from app.core.errors import AppError
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.risk_service import RiskService
from app.services.settings_service import SettingsService
from app.services.trading_mode_service import TradingModeService
from app.services.trading_request_service import TradingRequestService


class AutoPaperService:
    """Сервис автоматической торговли в paper-режиме."""

    def __init__(
        self,
        settings_service: SettingsService,
        trading_mode_service: TradingModeService,
        trading_repo: TradingRequestRepository,
        trading_request_service: TradingRequestService,
        risk_service: RiskService,
    ) -> None:
        self._settings = settings_service
        self._mode = trading_mode_service
        self._trading_repo = trading_repo
        self._trading_service = trading_request_service
        self._risk = risk_service

    @staticmethod
    def _coerce_bool(value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        if isinstance(value, (int, float)):
            return bool(value)
        return False

    def get_status(self) -> dict[str, object]:
        """Возвращает статус auto-paper."""
        enabled_item = self._settings._settings.get("auto_paper_enabled")
        enabled = self._coerce_bool(enabled_item.value) if enabled_item else False
        return {
            "enabled": enabled,
            "tradingMode": self._mode.get_current_mode(),
        }

    def enable(self) -> None:
        """Включает auto-paper. Hard guard: только в paper-режиме."""
        if self._mode.get_current_mode() != "paper":
            raise AppError(
                "AUTO_EXECUTION_FORBIDDEN_NON_PAPER",
                message="Автоисполнение разрешено только в режиме paper",
            )
        self._settings.update("auto_paper_enabled", True)

    def disable(self) -> None:
        """Выключает auto-paper."""
        self._settings.update("auto_paper_enabled", False)

    async def get_stats(
        self,
        db_session: AsyncSession,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, object]:
        """Возвращает статистику по исполненным заявкам в paper-режиме."""
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)

        try:
            items, total = await self._trading_repo.list_requests(
                db_session,
                status="EXECUTED",
                mode="paper",
                offset=0,
                limit=10000,
            )
            return {
                "startDate": str(start_date),
                "endDate": str(end_date),
                "executedCount": total,
            }
        except Exception:
            return {
                "startDate": str(start_date),
                "endDate": str(end_date),
                "executedCount": 0,
            }

    async def can_auto_execute(
        self, db_session: AsyncSession, request_id: UUID
    ) -> dict[str, object]:
        """
        Проверяет возможность автоматического исполнения заявки.
        Возвращает { canAutoExecute: bool, reason: str }.
        """
        # 1. Режим торговли — только paper
        if self._mode.get_current_mode() != "paper":
            return {
                "canAutoExecute": False,
                "reason": "Auto-execution only available in paper mode",
            }

        # 2. Auto-paper включен
        status = self.get_status()
        if not status.get("enabled"):
            return {
                "canAutoExecute": False,
                "reason": "Auto-execution is disabled",
            }

        # 3. Заявка существует и PENDING
        req = await self._trading_repo.get_by_id(db_session, request_id)
        if req is None:
            return {
                "canAutoExecute": False,
                "reason": "Request not found",
            }
        if req.status != "PENDING":
            return {
                "canAutoExecute": False,
                "reason": f"Request is not pending (status: {req.status})",
            }

        # 4. Не истекла
        if req.expires_at and req.expires_at <= now_msk():
            return {
                "canAutoExecute": False,
                "reason": "Request has expired",
            }

        # 5. Risk validation
        confidence = float(req.confidence) if req.confidence is not None else 0.5
        score = float(req.score) if req.score is not None else 0.5
        validation = self._risk.validate_order(
            figi=req.figi,
            action=req.action,
            quantity=req.quantity,
            price=req.price,
            confidence=confidence,
            score=score,
        )
        if not validation.get("isValid", True):
            return {
                "canAutoExecute": False,
                "reason": ", ".join(validation.get("errors", ["Risk validation failed"])),
            }

        return {"canAutoExecute": True, "reason": ""}

    async def auto_execute_request(
        self, db_session: AsyncSession, request_id: UUID
    ) -> dict[str, object]:
        """
        Автоматическое approve + execute для PENDING заявки в paper-режиме.
        """
        can_exec = await self.can_auto_execute(db_session, request_id)
        if not can_exec.get("canAutoExecute"):
            raise AppError(
                "BUSINESS_RULE_VIOLATION",
                message=can_exec.get("reason", "Cannot auto-execute"),
            )
        # Approve
        await self._trading_service.approve(db_session, request_id, comment=None)
        await db_session.flush()
        # Execute: используем price как actual_price, budget как actual_amount
        req = await self._trading_repo.get_by_id(db_session, request_id)
        actual_price = req.price if req else None
        actual_amount = req.budget if req else None
        result = await self._trading_service.execute(
            db_session,
            request_id,
            actual_price=actual_price,
            actual_amount=actual_amount,
        )
        return result
