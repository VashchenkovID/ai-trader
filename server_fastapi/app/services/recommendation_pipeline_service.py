"""Сервис pipeline: рекомендации -> автосоздание заявок."""

import logging
from collections import Counter
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models import Recommendation
from app.repositories.market_repository import MarketRepository
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.auto_paper_service import AutoPaperService
from app.services.trading_request_service import TradingRequestService

logger = logging.getLogger(__name__)


def _classify_auto_execute_skip_reason(detail: str) -> str:
    """Краткий код причины, почему автоисполнение не прошло (для сводок анализа)."""
    d = (detail or "").strip()
    low = d.lower()
    if "disabled" in low:
        return "auto_disabled"
    if "only available in paper" in low or "paper mode" in low:
        return "not_paper_mode"
    if "not pending" in low:
        return "not_pending"
    if "expired" in low:
        return "expired"
    if "экспозиц" in d.lower():
        return "exposure_limit"
    if "размер позиции" in d.lower():
        return "position_limit"
    if "уверенность" in d.lower():
        return "confidence_floor"
    if "дневной убыток" in d.lower():
        return "daily_loss"
    if "убытков подряд" in d.lower():
        return "consecutive_losses"
    return "other"


_DEFAULT_MIN_CONFIDENCE = Decimal("0.5")
_DEFAULT_MIN_SCORE = Decimal("0.5")


def _resolve_pipeline_thresholds(
    *,
    mode: str,
    min_confidence: Decimal | None,
    min_score: Decimal | None,
) -> tuple[Decimal, Decimal]:
    settings = get_settings()
    if mode == "paper":
        mc = (
            min_confidence
            if min_confidence is not None
            else Decimal(str(settings.paper_pipeline_min_confidence))
        )
        ms = min_score if min_score is not None else Decimal(str(settings.paper_pipeline_min_score))
        return mc, ms
    mc = min_confidence if min_confidence is not None else _DEFAULT_MIN_CONFIDENCE
    ms = min_score if min_score is not None else _DEFAULT_MIN_SCORE
    return mc, ms


def _effective_trade_signal(
    rec: Recommendation,
    *,
    mode: str,
) -> tuple[str, Decimal, Decimal]:
    """
    Действие и величины для отбора в pipeline.
    При mode=paper и PAPER_SOFT_USE_DB_COLUMNS (по умолчанию True) — из колонок paper_*,
    если paper_recommendation задан; иначе основной сигнал.
    При PAPER_SOFT_HOLD_TO_BUY — HOLD с прохождением порогов трактуется как BUY (если paper не переопределил).
    """
    settings = get_settings()
    prim = str(rec.recommendation or "").upper()
    conf = rec.confidence
    scr = rec.score

    paper_rec = getattr(rec, "paper_recommendation", None)
    if mode == "paper" and settings.paper_soft_use_db_columns and paper_rec:
        pa = str(paper_rec).upper()
        pc = getattr(rec, "paper_confidence", None)
        ps = getattr(rec, "paper_score", None)
        if pc is not None:
            conf = pc
        if ps is not None:
            scr = ps
        return pa, conf, scr

    if mode == "paper" and settings.paper_soft_hold_to_buy and prim == "HOLD":
        return "BUY", conf, scr

    return prim, conf, scr


class RecommendationPipelineService:
    """Обрабатывает рекомендации и создает заявки по порогам и дедупликации."""

    def __init__(
        self,
        trading_service: TradingRequestService,
        market_repo: MarketRepository,
        trading_repo: TradingRequestRepository,
        auto_paper_service: AutoPaperService | None = None,
    ) -> None:
        self._trading = trading_service
        self._market = market_repo
        self._trading_repo = trading_repo
        self._auto_paper = auto_paper_service

    async def _maybe_auto_execute_paper(
        self,
        db_session: AsyncSession,
        *,
        mode: str,
        figi: str,
        dto: dict[str, object],
    ) -> tuple[bool, str | None]:
        """
        После создания PENDING-заявки в paper — approve+execute через AutoPaperService,
        если включён auto_paper и режим торговли paper (см. can_auto_execute).
        """
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
                "Pipeline: auto-paper не исполнил заявку %s (figi=%s): %s",
                request_id,
                figi,
                e.message,
            )
            return False, str(e.message)
        except Exception as e:
            logger.exception("Pipeline: ошибка auto-paper для figi=%s", figi)
            return False, str(e)

    async def run(
        self,
        db_session: AsyncSession,
        *,
        mode: str = "paper",
        min_confidence: Decimal | None = None,
        min_score: Decimal | None = None,
        limit: int = 50,
    ) -> dict[str, object]:
        """
        Обрабатывает рекомендации: проверяет пороги, дедупликацию, создает заявки.
        Возвращает сводку: created, skipped (с причинами).
        """
        min_conf, min_scr = _resolve_pipeline_thresholds(
            mode=mode,
            min_confidence=min_confidence,
            min_score=min_score,
        )

        created: list[str] = []
        skipped: list[dict[str, object]] = []
        auto_executed: list[str] = []
        auto_execute_skipped: list[dict[str, object]] = []

        try:
            recs = await self._market.list_recommendations(
                db_session, offset=0, limit=limit
            )
        except Exception:
            return {
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

        for rec in recs:
            figi = rec.figi
            eff_action, confidence, score = _effective_trade_signal(rec, mode=mode)

            if confidence < min_conf or score < min_scr:
                skipped.append({
                    "figi": figi,
                    "reason": "threshold",
                    "detail": f"confidence={confidence}, score={score} below min",
                })
                continue

            if eff_action not in ("BUY", "SELL"):
                skipped.append({"figi": figi, "reason": "hold", "detail": "recommendation is HOLD"})
                continue

            try:
                active = await self._trading_repo.count_active_by_figi(db_session, figi=figi)
                if active > 0:
                    skipped.append({"figi": figi, "reason": "duplicate", "detail": "active request exists"})
                    continue

                dto = await self._trading.create_from_recommendation(
                    db_session,
                    figi,
                    mode=mode,
                    action=eff_action,
                    confidence_override=confidence,
                    score_override=score,
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

        exploration_created: list[str] = []
        settings = get_settings()
        if (
            mode == "paper"
            and settings.paper_exploration_enabled
            and settings.paper_exploration_max_extra > 0
        ):
            max_extra = int(settings.paper_exploration_max_extra)
            min_expl_score = Decimal(str(settings.paper_exploration_min_score))
            action_expl = (settings.paper_exploration_action or "BUY").strip().upper()
            if action_expl not in ("BUY", "SELL"):
                action_expl = "BUY"
            ranked = sorted(
                (r for r in recs if str(r.recommendation or "").upper() == "HOLD"),
                key=lambda r: float(r.score or 0),
                reverse=True,
            )
            for rec in ranked:
                if len(exploration_created) >= max_extra:
                    break
                figi = rec.figi
                if figi in created or figi in exploration_created:
                    continue
                _, conf_eff, scr_eff = _effective_trade_signal(rec, mode=mode)
                if conf_eff < min_conf or scr_eff < min_expl_score:
                    continue
                try:
                    active = await self._trading_repo.count_active_by_figi(db_session, figi=figi)
                    if active > 0:
                        continue
                    dto = await self._trading.create_from_recommendation(
                        db_session,
                        figi,
                        mode=mode,
                        action=action_expl,
                        confidence_override=conf_eff,
                        score_override=scr_eff,
                    )
                    exploration_created.append(figi)
                    ok_ae, err_ae = await self._maybe_auto_execute_paper(
                        db_session, mode=mode, figi=figi, dto=dto
                    )
                    if ok_ae:
                        auto_executed.append(figi)
                    elif err_ae:
                        auto_execute_skipped.append({
                            "figi": figi,
                            "requestId": str(dto.get("id", "")),
                            "reason": _classify_auto_execute_skip_reason(err_ae),
                            "detail": err_ae,
                        })
                except Exception:
                    continue

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
                logger.warning("Pipeline: process_pending_paper_requests: %s", e)
                pending_paper_retry = {"error": str(e)}

        return {
            "created": created,
            "skipped": skipped,
            "explorationCreated": exploration_created,
            "autoExecuted": auto_executed,
            "autoExecuteSkipped": auto_execute_skipped,
            "autoExecuteSkippedByReason": skip_by_reason,
            "pendingPaperAutoRetry": pending_paper_retry,
            "total": len(recs),
        }
