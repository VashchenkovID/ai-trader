"""Оркестратор: mu/S → max Sharpe → cap по FIGI для validate_order (REWRITE_CORE §3–5)."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.market_returns_service import MarketReturnsService
from app.services.risk_optimization_service import RiskOptimizationService
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)


class RiskPypfoptOrchestrator:
    """Строит матрицу доходностей по universe и возвращает долю max-Sharpe для FIGI заявки."""

    def __init__(
        self,
        *,
        settings_service: SettingsService,
        market_returns_service: MarketReturnsService,
        risk_optimization_service: RiskOptimizationService,
    ) -> None:
        self._settings = settings_service
        self._returns = market_returns_service
        self._opt = risk_optimization_service

    def _coerce_bool(self, key: str, default: bool = False) -> bool:
        item = self._settings._settings.get(key)
        if item is None:
            return default
        v = item.value
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in {"1", "true", "yes", "on"}
        return bool(v)

    def _universe_list(self) -> list[str]:
        item = self._settings._settings.get("risk.pypfopt_universe")
        if not item or item.value is None:
            return []
        raw = item.value
        if isinstance(raw, list):
            return [str(x).strip() for x in raw if str(x).strip()]
        if isinstance(raw, str):
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                return []
            if isinstance(data, list):
                return [str(x).strip() for x in data if str(x).strip()]
        return []

    async def max_position_fraction_cap_for_figi(
        self,
        db_session: AsyncSession,
        *,
        order_figi: str,
    ) -> float | None:
        """
        Возвращает верхнюю границу доли позиции из веса max-Sharpe или None (без cap / fallback).
        Требует risk.pypfopt_enabled, доступный PyPortfolioOpt и ≥2 FIGI в universe.
        """
        if not self._coerce_bool("risk.pypfopt_enabled", False):
            return None
        if not self._opt.is_available():
            return None

        figi = str(order_figi).strip()
        if not figi:
            return None

        universe = self._universe_list()
        figis = list(dict.fromkeys([*universe, figi]))
        if len(figis) < 2:
            logger.info("risk.pypfopt: universe too small (%s figis), skip cap", len(figis))
            return None

        try:
            rets = await self._returns.build_returns_matrix_for_figis(
                db_session, figis, candle_limit_per_figi=400, how="inner"
            )
        except Exception as e:
            logger.warning("risk.pypfopt: returns matrix failed: %s", e)
            return None

        if rets is None or getattr(rets, "empty", True) or len(rets.columns) < 2:
            logger.info("risk.pypfopt: insufficient returns columns")
            return None

        out = self._opt.max_sharpe_weights(rets)
        if not out.get("ok"):
            logger.warning("risk.pypfopt: optimizer: %s", out.get("error"))
            return None
        weights: dict[str, float] = out.get("weights") or {}
        w = self._opt.weight_for_figi(weights, figi)
        if w is None or w <= 0:
            return None
        return float(w)
