"""
Вспомогательные структуры RL-контура.

Основной тренировочный цикл реализован в `training.rl.train_agent`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RLAction:
    """Справочник действий RL-агента."""

    HOLD: int = 0
    BUY: int = 1
    SELL: int = 2


__all__ = ["RLAction"]
