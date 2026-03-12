from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import iso_now_msk
from app.repositories.profitability_repository import ProfitabilityRepository


class ProfitabilityService:
    """Сервис агрегатов прибыльности через repository слой."""

    def __init__(self, repository: ProfitabilityRepository) -> None:
        self._repository = repository

    async def get_status(self, db_session: AsyncSession) -> dict[str, object]:
        try:
            tracked_strategies, last_calc = await self._repository.status_summary(db_session)
        except Exception:
            return {
                "isInitialized": False,
                "trackedStrategies": 0,
                "lastCalculationAt": None,
            }
        return {
            "isInitialized": True,
            "trackedStrategies": tracked_strategies,
            "lastCalculationAt": last_calc or iso_now_msk(),
        }

    async def get_analysis(self, db_session: AsyncSession) -> dict[str, object]:
        try:
            gross_profit, gross_loss, total_count, win_count = await self._repository.pnl_aggregate(db_session)
        except Exception:
            gross_profit, gross_loss, total_count, win_count = 0.0, 0.0, 0, 0
        profit_factor = 0.0 if gross_loss == 0 else round(gross_profit / gross_loss, 4)
        win_rate = 0.0 if total_count == 0 else round(win_count / total_count, 4)
        return {
            "grossProfit": float(gross_profit),
            "grossLoss": float(gross_loss),
            "profitFactor": profit_factor,
            "winRate": win_rate,
        }

    async def get_report(self, db_session: AsyncSession) -> dict[str, object]:
        """Возвращает краткий отчет для UI/экспорта."""
        analysis = await self.get_analysis(db_session)
        return {
            "period": "30d",
            "pnl": round(float(analysis["grossProfit"]) - float(analysis["grossLoss"]), 2),
            "bestStrategy": None,
            "worstStrategy": None,
        }
