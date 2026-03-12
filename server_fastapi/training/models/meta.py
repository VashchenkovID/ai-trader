"""
Мета-обучение: адаптация весов ансамбля под режим рынка.

Вход может включать агрегированные мнения LLM (консенсус жюри) как признак режима.
Возвращает веса для EnsemblePredictor (horizon_weights, strategy_weights).
База паттернов и сложная адаптация расширяются по мере реализации Phase 4.
"""

from __future__ import annotations

import torch

from training.models.nn import N_HORIZONS, N_STRATEGIES


def get_meta_weights(
    llm_consensus: float | None = None,
    device: torch.device | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Возвращает веса ансамбля (horizon_weights, strategy_weights) для EnsemblePredictor.

    llm_consensus: опционально, агрегат мнений LLM-жюри в [0, 1]. При None или вне диапазона
    используются равные веса. В перспективе: сдвиг в сторону conservative при низком консенсусе,
    больший вес среднего горизонта при высокой уверенности и т.д.
    """
    if device is None:
        device = torch.device("cpu")
    # Пока — равные веса. Расширение: по llm_consensus выбирать профиль (risk-on / risk-off).
    horizon_weights = torch.ones(N_HORIZONS, device=device) / N_HORIZONS
    strategy_weights = torch.ones(N_STRATEGIES, device=device) / N_STRATEGIES
    if llm_consensus is not None and 0 <= llm_consensus <= 1:
        # Минимальная адаптация: при низком консенсусе чуть повышаем вес умеренной стратегии
        if llm_consensus < 0.4:
            strategy_weights = torch.tensor([0.2, 0.6, 0.2], device=device, dtype=torch.float32)
        elif llm_consensus > 0.7:
            strategy_weights = torch.tensor([0.35, 0.3, 0.35], device=device, dtype=torch.float32)
    return horizon_weights, strategy_weights


__all__ = ["get_meta_weights"]
