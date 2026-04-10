"""Конфигурация виртуального профиля (REWRITE_CORE §13)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PortfolioProfileConfig(BaseModel):
    """Пороги сигналов и «узкие» лимиты поверх глобальных risk.limits."""

    signal_min_score: float = Field(ge=0.0, le=1.0)
    signal_min_confidence: float = Field(ge=0.0, le=1.0)
    max_position_fraction: float = Field(gt=0.0, le=1.0)
    max_total_exposure_fraction: float = Field(gt=0.0, le=1.0)
    rebalance_days: int | None = Field(default=None, ge=1, le=365)
