"""Сервис pipeline: рекомендации -> автосоздание заявок."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.market_repository import MarketRepository
from app.repositories.trading_request_repository import TradingRequestRepository
from app.services.trading_request_service import TradingRequestService


_DEFAULT_MIN_CONFIDENCE = Decimal("0.5")
_DEFAULT_MIN_SCORE = Decimal("0.5")


class RecommendationPipelineService:
    """Обрабатывает рекомендации и создает заявки по порогам и дедупликации."""

    def __init__(
        self,
        trading_service: TradingRequestService,
        market_repo: MarketRepository,
        trading_repo: TradingRequestRepository,
    ) -> None:
        self._trading = trading_service
        self._market = market_repo
        self._trading_repo = trading_repo

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
        min_conf = min_confidence if min_confidence is not None else _DEFAULT_MIN_CONFIDENCE
        min_scr = min_score if min_score is not None else _DEFAULT_MIN_SCORE

        created: list[str] = []
        skipped: list[dict[str, object]] = []

        try:
            recs = await self._market.list_recommendations(
                db_session, offset=0, limit=limit
            )
        except Exception:
            return {"created": [], "skipped": [], "total": 0, "error": "failed_to_fetch"}

        for rec in recs:
            figi = rec.figi
            confidence = rec.confidence
            score = rec.score

            if confidence < min_conf or score < min_scr:
                skipped.append({
                    "figi": figi,
                    "reason": "threshold",
                    "detail": f"confidence={confidence}, score={score} below min",
                })
                continue

            if rec.recommendation not in ("BUY", "SELL"):
                skipped.append({"figi": figi, "reason": "hold", "detail": "recommendation is HOLD"})
                continue

            try:
                active = await self._trading_repo.count_active_by_figi(db_session, figi=figi)
                if active > 0:
                    skipped.append({"figi": figi, "reason": "duplicate", "detail": "active request exists"})
                    continue

                await self._trading.create_from_recommendation(
                    db_session, figi, mode=mode, action=rec.recommendation
                )
                created.append(figi)
            except Exception as e:
                msg = str(e)
                if "INSUFFICIENT_STRATEGY_BUDGET" in msg or "budget" in msg.lower():
                    skipped.append({"figi": figi, "reason": "budget", "detail": msg})
                elif "CONFLICT" in msg or "активн" in msg.lower():
                    skipped.append({"figi": figi, "reason": "duplicate", "detail": msg})
                else:
                    skipped.append({"figi": figi, "reason": "error", "detail": msg})

        return {
            "created": created,
            "skipped": skipped,
            "total": len(recs),
        }
