"""
Оптимизация портфеля (PyPortfolioOpt): mu, ковариация, max Sharpe.

Требует optional-зависимости `quant` (см. pyproject.toml).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

try:
    from pypfopt import EfficientFrontier, expected_returns, risk_models

    _PYPFOPT_AVAILABLE = True
except ImportError:
    EfficientFrontier = None  # type: ignore[misc, assignment]
    expected_returns = None  # type: ignore[misc, assignment]
    risk_models = None  # type: ignore[misc, assignment]
    _PYPFOPT_AVAILABLE = False


class RiskOptimizationService:
    """Обёртка над PyPortfolioOpt с проверкой доступности библиотеки."""

    @staticmethod
    def is_available() -> bool:
        return _PYPFOPT_AVAILABLE

    @staticmethod
    def compute_mu_and_covariance(returns_df: pd.DataFrame) -> tuple[pd.Series, pd.DataFrame]:
        """
        Исторические ожидаемые доходности и выборочная ковариация.
        `returns_df`: даты × активы (дневные доходности).
        """
        if not _PYPFOPT_AVAILABLE or returns_df is None or returns_df.empty:
            return pd.Series(dtype=float), pd.DataFrame()
        mu = expected_returns.mean_historical_return(returns_df, frequency=252)
        S = risk_models.sample_cov(returns_df, frequency=252)
        return mu, S

    @staticmethod
    def max_sharpe_weights(
        returns_df: pd.DataFrame,
        *,
        weight_bounds: tuple[float, float] = (0.0, 1.0),
        risk_free_rate: float = 0.0,
    ) -> dict[str, Any]:
        """
        Веса по максимуму Sharpe. Возвращает dict с ключами:
        weights (cleaned), mu, cov_diag (кратко), sharpe (если удалось).
        """
        if not _PYPFOPT_AVAILABLE or returns_df is None or returns_df.empty:
            return {
                "ok": False,
                "error": "pypfopt_not_available_or_empty_returns",
                "weights": {},
            }
        clean = returns_df.replace([np.inf, -np.inf], np.nan).dropna(how="any")
        if clean.empty or len(clean) < 5:
            return {"ok": False, "error": "returns_contain_invalid_or_too_few_rows", "weights": {}}
        mu, S = RiskOptimizationService.compute_mu_and_covariance(clean)
        if mu.empty or S.empty:
            return {"ok": False, "error": "empty_mu_or_cov", "weights": {}}
        mu = mu.replace([np.inf, -np.inf], np.nan).fillna(0.0)
        S = S.replace([np.inf, -np.inf], np.nan).fillna(0.0)
        try:
            ef = EfficientFrontier(mu, S, weight_bounds=weight_bounds)
            ef.max_sharpe(risk_free_rate=risk_free_rate)
            cleaned = ef.clean_weights()
        except Exception as e:
            return {"ok": False, "error": f"optimizer_failed:{e!s}", "weights": {}}
        try:
            perf = ef.portfolio_performance(verbose=False, risk_free_rate=risk_free_rate)
            sharpe = float(perf[2]) if perf and len(perf) > 2 else None
        except Exception:
            sharpe = None
        return {
            "ok": True,
            "weights": {str(k): float(v) for k, v in cleaned.items()},
            "mu_annual": mu.to_dict(),
            "sharpe": sharpe,
        }

    @staticmethod
    def weight_for_figi(weights: dict[str, float], figi: str) -> float | None:
        """Доля актива из результата max_sharpe_weights."""
        if not weights:
            return None
        key = str(figi).strip()
        if key in weights:
            return float(weights[key])
        return None
