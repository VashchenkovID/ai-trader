from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_msk
from app.core.config import get_settings
from app.core.errors import AppError
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.portfolio_profile_config_service import PortfolioProfileConfigService
from app.services.risk_pypfopt_orchestrator import RiskPypfoptOrchestrator
from app.services.risk_service import RiskService
from app.services.settings_service import SettingsService
from app.services.trading_mode_service import TradingModeService
from app.services.trading_request_service import TradingRequestService
from app.core.virtual_profiles import normalize_virtual_profile
from app.services.virtual_portfolio_service import VirtualPortfolioService


class AutoPaperService:
    """Сервис автоматической торговли в paper-режиме."""

    def __init__(
        self,
        settings_service: SettingsService,
        trading_mode_service: TradingModeService,
        trading_repo: TradingRequestRepository,
        trading_request_service: TradingRequestService,
        risk_service: RiskService,
        virtual_portfolio_service: VirtualPortfolioService | None = None,
        portfolio_profile_config_service: PortfolioProfileConfigService | None = None,
        risk_pypfopt_orchestrator: RiskPypfoptOrchestrator | None = None,
    ) -> None:
        self._settings = settings_service
        self._mode = trading_mode_service
        self._trading_repo = trading_repo
        self._trading_service = trading_request_service
        self._risk = risk_service
        self._virtual_portfolio = virtual_portfolio_service
        self._profile_cfg = portfolio_profile_config_service
        self._pypfopt = risk_pypfopt_orchestrator

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

        # 5. Risk validation — те же капитал и доля позиции, что при расчёте qty заявки,
        # иначе validate_order с дефолтом 1M и maxPosition 0.05 отклоняет нормальные paper-заявки.
        confidence = float(req.confidence) if req.confidence is not None else 0.5
        score = float(req.score) if req.score is not None else 0.5
        env_floor = float(get_settings().paper_pipeline_min_confidence)

        vslug = normalize_virtual_profile(getattr(req, "virtual_profile_slug", None) or None)
        prof = (
            self._profile_cfg.get_config(vslug)
            if self._profile_cfg is not None
            else None
        )
        if prof is not None:
            if score < prof.signal_min_score:
                return {
                    "canAutoExecute": False,
                    "reason": (
                        f"Score {score:.3f} ниже порога профиля {vslug} ({prof.signal_min_score})"
                    ),
                }
            if confidence < prof.signal_min_confidence:
                return {
                    "canAutoExecute": False,
                    "reason": (
                        f"Уверенность {confidence:.3f} ниже порога профиля {vslug} "
                        f"({prof.signal_min_confidence})"
                    ),
                }
        floor = env_floor
        if prof is not None:
            floor = max(floor, float(prof.signal_min_confidence))

        portfolio_value: Decimal
        current_exposure: Decimal
        max_pos_frac: float
        max_total_exp: float | None = None

        max_pos_raw = "0.1"
        if self._trading_service is not None:
            max_pos_raw = await self._trading_service._read_app_setting_str(
                db_session, "risk.maxPositionSize", "0.1"
            )
        try:
            max_pos_frac = float(max_pos_raw)
        except Exception:
            max_pos_frac = 0.1
        max_pos_frac = min(max(max_pos_frac, 1e-9), 1.0)
        if prof is not None:
            max_pos_frac = min(max_pos_frac, float(prof.max_position_fraction))
            max_total_exp = float(prof.max_total_exposure_fraction)

        if self._virtual_portfolio is not None:
            row = await self._virtual_portfolio.get_or_create_snapshot(
                db_session, profile_slug=vslug
            )
            await self._virtual_portfolio.recalculate_totals(db_session, row)
            await db_session.flush()
            tv = float(row.total_value) if row.total_value is not None else 0.0
            pv = float(row.positions_value) if row.positions_value is not None else 0.0
            portfolio_value = Decimal(str(tv)) if tv > 0 else Decimal("0")
            current_exposure = Decimal(str(pv)) if pv >= 0 else Decimal("0")
        else:
            portfolio_value = Decimal("1000000")
            current_exposure = Decimal("0")

        if portfolio_value <= 0:
            cap_raw = "1000000"
            if self._trading_service is not None:
                cap_raw = await self._trading_service._read_app_setting_str(
                    db_session, "portfolio.virtual.initial_capital", "1000000"
                )
            try:
                portfolio_value = Decimal(str(cap_raw))
            except Exception:
                portfolio_value = Decimal("1000000")
            if portfolio_value <= 0:
                portfolio_value = Decimal("1000000")

        cap_opt: float | None = None
        if self._pypfopt is not None and req.figi:
            try:
                cap_opt = await self._pypfopt.max_position_fraction_cap_for_figi(
                    db_session, order_figi=str(req.figi)
                )
            except Exception:
                cap_opt = None

        validation = self._risk.validate_order(
            figi=req.figi,
            action=req.action,
            quantity=req.quantity,
            price=req.price,
            confidence=confidence,
            score=score,
            portfolio_value=portfolio_value,
            current_exposure=current_exposure,
            confidence_hard_floor=floor,
            max_position_fraction=max_pos_frac,
            max_total_exposure_fraction=max_total_exp,
            max_position_fraction_cap=cap_opt,
        )
        if not validation.get("isValid", True):
            return {
                "canAutoExecute": False,
                "reason": ", ".join(validation.get("errors", ["Risk validation failed"])),
            }

        return {"canAutoExecute": True, "reason": ""}

    async def process_pending_paper_requests(
        self, db_session: AsyncSession, *, limit: int = 100
    ) -> dict[str, object]:
        """
        Повторные попытки автоисполнения для накопившихся PENDING paper (догон после сбоев риска/настроек).
        """
        if self._mode.get_current_mode() != "paper":
            return {"attempted": 0, "executedFigis": [], "failed": [], "note": "not_paper_mode"}
        if not self.get_status().get("enabled"):
            return {"attempted": 0, "executedFigis": [], "failed": [], "note": "auto_disabled"}

        items, _total = await self._trading_repo.list_requests(
            db_session, status="PENDING", mode="paper", offset=0, limit=limit
        )
        executed_figis: list[str] = []
        failed: list[dict[str, object]] = []
        for req in items:
            try:
                await self.auto_execute_request(db_session, req.id)
                if req.figi:
                    executed_figis.append(str(req.figi))
            except AppError as e:
                failed.append({
                    "figi": req.figi,
                    "requestId": str(req.id),
                    "detail": str(e.message),
                })
            except Exception as e:
                failed.append({
                    "figi": req.figi,
                    "requestId": str(req.id),
                    "detail": str(e),
                })
        return {
            "attempted": len(items),
            "executedFigis": executed_figis,
            "failed": failed,
        }

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
        # Одобрение в paper сразу исполняет заявку (см. TradingRequestService.approve).
        result = await self._trading_service.approve(db_session, request_id, comment=None)
        await db_session.flush()
        return result
