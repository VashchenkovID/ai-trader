"""Загрузка рядов цен из БД и построение матрицы доходностей (Фаза A)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from training.data.returns_matrix import build_returns_matrix

if TYPE_CHECKING:
    from app.repositories.market_repository import MarketRepository


class MarketReturnsService:
    def __init__(self, market_repo: MarketRepository) -> None:
        self._repo = market_repo

    async def load_close_series(
        self,
        db_session: AsyncSession,
        figi: str,
        *,
        limit: int = 500,
    ) -> pd.Series:
        """Последние `limit` свечей по FIGI, по возрастанию времени; Series закрытий."""
        candles = await self._repo.get_candles_by_figi(
            db_session, figi=figi, offset=0, limit=limit
        )
        if not candles:
            return pd.Series(dtype=float, name=figi)
        times = [c.candle_time for c in candles]
        closes = [float(c.close) for c in candles]
        idx = pd.to_datetime(times)
        return pd.Series(closes, index=idx, name=figi)

    async def build_returns_matrix_for_figis(
        self,
        db_session: AsyncSession,
        figis: list[str],
        *,
        candle_limit_per_figi: int = 500,
        how: str = "inner",
    ) -> pd.DataFrame:
        """Wide DataFrame дневных доходностей (см. training/data/DATA_CONTRACT.md)."""
        closes_by_figi: dict[str, pd.Series] = {}
        for f in figis:
            f = str(f).strip()
            if not f:
                continue
            s = await self.load_close_series(db_session, f, limit=candle_limit_per_figi)
            if not s.empty:
                closes_by_figi[f] = s
        return build_returns_matrix(closes_by_figi, how=how)  # type: ignore[arg-type]
