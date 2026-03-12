"""
Базовая NN с conditioning по стратегии и горизонту.

Вход: фичи (X), strategy_id (0=aggressive, 1=moderate, 2=conservative),
      horizon_id (0=short, 1=medium, 2=long).
Выход: score [0, 1], confidence [0, 1].
"""

from __future__ import annotations

import torch
import torch.nn as nn


# Число стратегий и горизонтов по плану
N_STRATEGIES = 3
N_HORIZONS = 3


class CondMLP(nn.Module):
    """
    MLP-backbone с embedding для strategy_id и horizon_id.
    representation + strategy_emb + horizon_emb -> FC -> score, confidence.
    """

    def __init__(
        self,
        input_size: int,
        hidden_sizes: list[int] = (64, 32),
        embed_dim: int = 8,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.input_size = input_size
        self.embed_dim = embed_dim
        layers: list[nn.Module] = []
        prev = input_size
        for h in hidden_sizes:
            layers.extend([nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)])
            prev = h
        self.backbone = nn.Sequential(*layers)
        self.repr_size = prev
        self.strategy_embed = nn.Embedding(N_STRATEGIES, embed_dim)
        self.horizon_embed = nn.Embedding(N_HORIZONS, embed_dim)
        head_in = self.repr_size + embed_dim * 2
        self.head = nn.Sequential(
            nn.Linear(head_in, 16),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(16, 2),
            nn.Sigmoid(),
        )

    def forward(
        self,
        x: torch.Tensor,
        strategy_id: torch.Tensor,
        horizon_id: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        x: (batch, input_size)
        strategy_id: (batch,) long 0..2
        horizon_id: (batch,) long 0..2
        Returns: score (batch,), confidence (batch,)
        """
        rep = self.backbone(x)
        s_emb = self.strategy_embed(strategy_id)
        h_emb = self.horizon_embed(horizon_id)
        combined = torch.cat([rep, s_emb, h_emb], dim=1)
        out = self.head(combined)
        score = out[:, 0]
        confidence = out[:, 1]
        return score, confidence


class StrategyHorizonCondNet(nn.Module):
    """
    Обёртка: при инференсе принимает фичи и опционально strategy_id/horizon_id.
    По умолчанию strategy_id=1 (moderate), horizon_id=1 (medium).
    """

    def __init__(self, base: CondMLP):
        super().__init__()
        self.base = base

    def forward(
        self,
        x: torch.Tensor,
        strategy_id: torch.Tensor | None = None,
        horizon_id: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        batch = x.shape[0]
        device = x.device
        if strategy_id is None:
            strategy_id = torch.full((batch,), 1, dtype=torch.long, device=device)
        if horizon_id is None:
            horizon_id = torch.full((batch,), 1, dtype=torch.long, device=device)
        return self.base(x, strategy_id, horizon_id)
