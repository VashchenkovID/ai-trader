"""
Ансамбль предсказаний по горизонтам и стратегиям.

Одна модель CondMLP вызывается для каждой пары (strategy_id, horizon_id);
результаты агрегируются (среднее или взвешенное) в итоговый score и confidence.
Стекинг: мета-модель на предсказаниях базовых — отдельный контур (см. stacking в плане).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import torch

from training.models.nn import CondMLP, N_HORIZONS, N_STRATEGIES

if TYPE_CHECKING:
    from pathlib import Path


def aggregate_predictions(
    scores: torch.Tensor,
    confidences: torch.Tensor,
    weights: torch.Tensor | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Агрегирует предсказания по ансамблю. scores, confidences: (n_models, batch).
    weights: (n_models,) или None (равные веса). Возвращает (score, confidence) формы (batch,).
    """
    if weights is None:
        weights = torch.ones(scores.shape[0], device=scores.device) / scores.shape[0]
    w = weights / weights.sum()
    w = w.view(-1, 1)
    score = (scores * w).sum(dim=0)
    confidence = (confidences * w).sum(dim=0)
    return score, confidence


class EnsemblePredictor:
    """
    Ансамбль по всем парам (strategy_id, horizon_id): одна модель вызывается 9 раз
    (3 стратегии × 3 горизонта), результаты агрегируются.
    """

    def __init__(
        self,
        model: CondMLP,
        horizon_weights: torch.Tensor | None = None,
        strategy_weights: torch.Tensor | None = None,
    ):
        self.model = model
        self.horizon_weights = horizon_weights or torch.ones(N_HORIZONS) / N_HORIZONS
        self.strategy_weights = strategy_weights or torch.ones(N_STRATEGIES) / N_STRATEGIES

    def forward(
        self,
        x: torch.Tensor,
        aggregate: bool = True,
    ) -> tuple[torch.Tensor, torch.Tensor] | list[tuple[torch.Tensor, torch.Tensor]]:
        """
        x: (batch, n_features). Если aggregate=True, возвращает (score, confidence) (batch,).
        Если False — список из 9 пар (score, confidence) по каждой паре (strategy, horizon).
        """
        device = x.device
        self.horizon_weights = self.horizon_weights.to(device)
        self.strategy_weights = self.strategy_weights.to(device)
        scores_list: list[torch.Tensor] = []
        conf_list: list[torch.Tensor] = []
        for s in range(N_STRATEGIES):
            for h in range(N_HORIZONS):
                sid = torch.full((x.shape[0],), s, dtype=torch.long, device=device)
                hid = torch.full((x.shape[0],), h, dtype=torch.long, device=device)
                sc, cf = self.model(x, sid, hid)
                scores_list.append(sc)
                conf_list.append(cf)
        scores = torch.stack(scores_list, dim=0)
        confidences = torch.stack(conf_list, dim=0)
        if not aggregate:
            return [(scores[i], confidences[i]) for i in range(scores.shape[0])]
        weights = (self.strategy_weights.unsqueeze(1) * self.horizon_weights.unsqueeze(0)).flatten()
        return aggregate_predictions(scores, confidences, weights)
