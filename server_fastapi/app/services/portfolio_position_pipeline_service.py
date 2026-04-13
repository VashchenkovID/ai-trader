"""Пайплайн: вердикты portfolio_position_recommendations -> заявки (paper + auto-paper)."""

from __future__ import annotations

import logging
from collections import Counter
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.portfolio_scope import canonical_portfolio_scope, virtual_slug_from_scope
from app.core.virtual_profiles import normalize_virtual_profile
from app.db.models import PortfolioPositionRecommendation
from app.repositories.market_repository import MarketRepository
from app.repositories.portfolio_position_recommendation_repository import (
    PortfolioPositionRecommendationRepository,
)
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.auto_paper_service import AutoPaperService
from app.services.portfolio_profile_config_service import PortfolioProfileConfigService
from app.services.recommendation_pipeline_service import (
    _classify_auto_execute_skip_reason,
    _format_threshold_skip_detail,
)
from app.services.trading_request_service import TradingRequestService

logger = logging.getLogger(__name__)

_DEFAULT_MIN_CONFIDENCE = Decimal("0.5")
_DEFAULT_MIN_SCORE = Decimal("0.5")


def _resolve_ppr_thresholds(
    *,
    mode: str,
    min_confidence: Decimal | None,
    min_score: Decimal | None,
) -> tuple[Decimal, Decimal]:
    """Пороги PPR: в paper — из PPR_PIPELINE_MIN_* (или аргументы run)."""
    settings = get_settings()
    if mode == "paper":
        mc = (
            min_confidence
            if min_confidence is not None
            else Decimal(str(settings.ppr_pipeline_min_confidence))
        )
        ms = min_score if min_score is not None else Decimal(str(settings.ppr_pipeline_min_score))
        return mc, ms
    mc = min_confidence if min_confidence is not None else _DEFAULT_MIN_CONFIDENCE
    ms = min_score if min_score is not None else _DEFAULT_MIN_SCORE
    return mc, ms


def _effective_score_for_gate(row: PortfolioPositionRecommendation) -> Decimal:
    """
    Второй порог и score в заявке: не блокировать SELL из‑за низкого fusion score рынка.

    Рыночный score при HOLD/низкой «доле long» часто << порога, тогда как портфельный
    вердикт (final_confidence) высокий. Берём max(рынок, портфель), если рынок задан.
    """
    fc = row.final_confidence
    ms = row.market_score
    if ms is None:
        return fc
    return max(ms, fc)


class PortfolioPositionPipelineService:
    """Отбор последних PPR по scope, проверка порогов, create_from_data, auto-paper."""

    def __init__(
        self,
        trading_service: TradingRequestService,
        market_repo: MarketRepository,
        trading_repo: TradingRequestRepository,
        ppr_repo: PortfolioPositionRecommendationRepository,
        auto_paper_service: AutoPaperService | None = None,
        portfolio_profile_config_service: PortfolioProfileConfigService | None = None,
    ) -> None:
        self._trading = trading_service
        self._market = market_repo
        self._trading_repo = trading_repo
        self._ppr = ppr_repo
        self._auto_paper = auto_paper_service
        self._profile_cfg = portfolio_profile_config_service

    async def _maybe_auto_execute_paper(
        self,
        db_session: AsyncSession,
        *,
        mode: str,
        figi: str,
        dto: dict[str, object],
    ) -> tuple[bool, str | None]:
        if mode != "paper" or self._auto_paper is None:
            return False, None
        raw_id = dto.get("id")
        if raw_id is None:
            return False, "no_request_id"
        try:
            request_id = raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))
        except (ValueError, TypeError):
            return False, "invalid_request_id"
        try:
            await self._auto_paper.auto_execute_request(db_session, request_id)
            return True, None
        except AppError as e:
            logger.info(
                "PPR pipeline: auto-paper не исполнил заявку %s (figi=%s): %s",
                request_id,
                figi,
                e.message,
            )
            return False, str(e.message)
        except Exception as e:
            logger.exception("PPR pipeline: ошибка auto-paper для figi=%s", figi)
            return False, str(e)

    async def run_for_scope(
        self,
        db_session: AsyncSession,
        *,
        portfolio_scope: str,
        mode: str = "paper",
        min_confidence: Decimal | None = None,
        min_score: Decimal | None = None,
        limit: int = 50,
    ) -> dict[str, object]:
        """
        Последняя PPR по каждому FIGI в scope -> пороги -> create_from_data -> auto-paper.
        Один scope соответствует одному virtual_profile_slug (real -> default moderate).
        """
        scope = canonical_portfolio_scope(portfolio_scope)
        vslug_raw = virtual_slug_from_scope(scope)
        trade_slug = normalize_virtual_profile(vslug_raw)
        slug_for_gate = trade_slug

        settings = get_settings()
        min_conf, min_scr = _resolve_ppr_thresholds(
            mode=mode,
            min_confidence=min_confidence,
            min_score=min_score,
        )
        if (
            mode == "paper"
            and self._profile_cfg is not None
            and settings.ppr_pipeline_use_profile_gate
        ):
            p0 = self._profile_cfg.get_config(slug_for_gate)
            gate_conf = Decimal(str(p0.signal_min_confidence))
            gate_scr = Decimal(str(p0.signal_min_score))
            min_conf = max(min_conf, gate_conf)
            min_scr = max(min_scr, gate_scr)

        created: list[str] = []
        skipped: list[dict[str, object]] = []
        auto_executed: list[str] = []
        auto_execute_skipped: list[dict[str, object]] = []

        try:
            by_figi = await self._ppr.latest_by_figi_map(
                db_session, portfolio_scope=scope
            )
        except Exception:
            return {
                "portfolioScope": scope,
                "created": [],
                "skipped": [],
                "explorationCreated": [],
                "autoExecuted": [],
                "autoExecuteSkipped": [],
                "autoExecuteSkippedByReason": {},
                "pendingPaperAutoRetry": {},
                "total": 0,
                "error": "failed_to_fetch",
            }

        cap = max(0, min(limit, 200))
        ordered = sorted(by_figi.items(), key=lambda x: x[0])[:cap]

        for figi, row in ordered:
            action = (row.final_action or "").strip().upper()
            confidence = row.final_confidence
            score = _effective_score_for_gate(row)

            if confidence < min_conf or score < min_scr:
                skipped.append({
                    "figi": figi,
                    "reason": "threshold",
                    "detail": _format_threshold_skip_detail(
                        confidence,
                        score,
                        min_conf,
                        min_scr,
                        effective_action=action,
                        mode=mode,
                        paper_multi_profile=False,
                        profile_gate_active=(
                            mode == "paper"
                            and self._profile_cfg is not None
                            and settings.ppr_pipeline_use_profile_gate
                        ),
                    ),
                })
                continue

            if action not in ("BUY", "SELL"):
                skipped.append({"figi": figi, "reason": "hold", "detail": "final_action is HOLD"})
                continue

            try:
                if hasattr(self._trading_repo, "count_active_by_figi_and_profile"):
                    active = await self._trading_repo.count_active_by_figi_and_profile(
                        db_session, figi=figi, virtual_profile_slug=trade_slug
                    )
                else:
                    active = await self._trading_repo.count_active_by_figi(
                        db_session, figi=figi
                    )
                if active > 0:
                    skipped.append({
                        "figi": figi,
                        "reason": "duplicate",
                        "detail": "active request exists for profile",
                    })
                    continue

                instrument = await self._market.get_instrument_by_figi(db_session, figi)
                price = (
                    instrument.last_price
                    if instrument and instrument.last_price
                    else Decimal("0")
                )
                if price <= 0:
                    price = Decimal("1")

                conf_ord = confidence
                score_ord = score
                if (
                    mode == "paper"
                    and self._profile_cfg is not None
                    and settings.ppr_pipeline_bump_signal_to_profile_floor
                ):
                    prof = self._profile_cfg.get_config(trade_slug)
                    conf_ord = max(conf_ord, Decimal(str(prof.signal_min_confidence)))
                    score_ord = max(score_ord, Decimal(str(prof.signal_min_score)))

                recommendation_data: dict[str, object] = {
                    "figi": figi,
                    "recommendation": action,
                    "confidence": conf_ord,
                    "score": score_ord,
                    "price": price,
                    "ticker": instrument.ticker if instrument else None,
                    "name": instrument.name if instrument else None,
                }

                dto = await self._trading.create_from_data(
                    db_session,
                    recommendation_data,
                    mode=mode,
                    action=action,
                    quantity=None,
                    virtual_profile_slug=vslug_raw,
                )
                created.append(figi)
                ok_ae, err_ae = await self._maybe_auto_execute_paper(
                    db_session, mode=mode, figi=figi, dto=dto
                )
                if ok_ae:
                    auto_executed.append(figi)
                elif err_ae:
                    auto_execute_skipped.append({
                        "figi": figi,
                        "profile": trade_slug,
                        "requestId": str(dto.get("id", "")),
                        "reason": _classify_auto_execute_skip_reason(err_ae),
                        "detail": err_ae,
                    })
            except Exception as e:
                msg = str(e)
                if "INSUFFICIENT_STRATEGY_BUDGET" in msg or "budget" in msg.lower():
                    skipped.append({"figi": figi, "reason": "budget", "detail": msg})
                elif "CONFLICT" in msg or "активн" in msg.lower():
                    skipped.append({"figi": figi, "reason": "duplicate", "detail": msg})
                else:
                    skipped.append({"figi": figi, "reason": "error", "detail": msg})

        skip_by_reason = dict(Counter(s.get("reason", "unknown") for s in auto_execute_skipped))

        pending_paper_retry: dict[str, object] = {}
        if (
            mode == "paper"
            and self._auto_paper is not None
            and hasattr(self._trading_repo, "list_requests")
        ):
            try:
                pending_paper_retry = await self._auto_paper.process_pending_paper_requests(
                    db_session, limit=80
                )
            except Exception as e:
                logger.warning("PPR pipeline: process_pending_paper_requests: %s", e)
                pending_paper_retry = {"error": str(e)}

        return {
            "portfolioScope": scope,
            "created": created,
            "skipped": skipped,
            "explorationCreated": [],
            "autoExecuted": auto_executed,
            "autoExecuteSkipped": auto_execute_skipped,
            "autoExecuteSkippedByReason": skip_by_reason,
            "pendingPaperAutoRetry": pending_paper_retry,
            "total": len(ordered),
        }
