"""Целевые переменные для обучения из mu/S и статистик (REWRITE_CORE §7.2)."""

from __future__ import annotations

from typing import Any

import pandas as pd


def mu_vector_to_targets(mu: pd.Series) -> dict[str, float]:
    """Сериал ожидаемых доходностей (годовых) → dict FIGI → float для логирования/обучения."""
    if mu is None or mu.empty:
        return {}
    return {str(k): float(v) for k, v in mu.items()}


def backtest_stats_to_training_row(stats: dict[str, Any]) -> dict[str, float]:
    """Извлекает числовые метрики из результата BacktestingService для датасета."""
    out: dict[str, float] = {}
    for k in ("Sharpe Ratio", "Return [%]", "Max. Drawdown [%]", "# Trades", "Win Rate [%]"):
        if k in stats:
            try:
                out[k.replace(" ", "_").replace(".", "")] = float(stats[k])
            except (TypeError, ValueError):
                continue
    return out


def build_training_alignment_row(
    *,
    mu: pd.Series | None = None,
    backtest_stats: dict[str, Any] | None = None,
) -> dict[str, float]:
    """
    Объединяет цели из вектора mu (PyPortfolioOpt) и строки метрик бэктеста для Lightning/экспорта.
    Вызывайте после `max_sharpe_weights` / `run_sma_backtest` — см. REWRITE_CORE §7.
    """
    out: dict[str, float] = {}
    if mu is not None and not mu.empty:
        out.update(mu_vector_to_targets(mu))
    if backtest_stats:
        out.update(backtest_stats_to_training_row(backtest_stats))
    return out
