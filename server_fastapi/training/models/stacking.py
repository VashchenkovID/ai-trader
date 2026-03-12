"""
Мета-модель стекинга: вход — предсказания базовой CondMLP по всем 9 парам (strategy, horizon).

Вход: вектор длины 18 (9 пар × (score, confidence)). Выход: (score, confidence) после FC.
Используется поверх зафиксированной CondMLP для обучения второго уровня.
"""

from __future__ import annotations

import torch
import torch.nn as nn

# 9 пар (strategy, horizon) × 2 выхода (score, confidence)
STACKING_INPUT_SIZE = 9 * 2


class StackingModel(nn.Module):
    """
    Второй уровень стекинга: линейный слой + Sigmoid по предсказаниям базовой модели.
    """

    def __init__(self, input_size: int = STACKING_INPUT_SIZE, hidden_size: int = 16, dropout: float = 0.1):
        super().__init__()
        self.fc = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, 2),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """x: (batch, 18). Возвращает score (batch,), confidence (batch,)."""
        out = self.fc(x)
        return out[:, 0], out[:, 1]
