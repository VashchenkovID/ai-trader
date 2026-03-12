"""
Lightning-модуль для обучения CondMLP.

Метка: регрессия на доходность (target) или бинарная (рост/падение).
Loss: MSE по score относительно нормализованной метки [0,1] или BCE.
"""

from __future__ import annotations

from typing import Any

import torch
import pytorch_lightning as pl
from torch.utils.data import DataLoader, TensorDataset

from training.models.nn import CondMLP


class CondMLPLightning(pl.LightningModule):
    """Обучение CondMLP с conditioning (strategy_id, horizon_id)."""

    def __init__(
        self,
        input_size: int,
        hidden_sizes: list[int] = (64, 32),
        embed_dim: int = 8,
        dropout: float = 0.1,
        lr: float = 1e-3,
    ):
        super().__init__()
        self.save_hyperparameters()
        self.model = CondMLP(
            input_size=input_size,
            hidden_sizes=hidden_sizes,
            embed_dim=embed_dim,
            dropout=dropout,
        )
        self.lr = lr

    def forward(
        self,
        x: torch.Tensor,
        strategy_id: torch.Tensor,
        horizon_id: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        return self.model(x, strategy_id, horizon_id)

    def _step(
        self,
        batch: tuple[torch.Tensor, ...],
        prefix: str,
    ) -> torch.Tensor:
        x, strategy_id, horizon_id, target = batch
        score, confidence = self(x, strategy_id, horizon_id)
        # Нормализуем target в [0, 1] для регрессии (tanh-style: (1 + x) / 2, clamp)
        target_clamp = torch.clamp((1 + target) / 2, 0.0, 1.0)
        loss_score = torch.nn.functional.mse_loss(score, target_clamp)
        loss_conf = 0.1 * (1 - confidence).mean()
        loss = loss_score + loss_conf
        self.log(f"{prefix}_loss", loss, on_step=False, on_epoch=True)
        self.log(f"{prefix}_score_mse", loss_score, on_step=False, on_epoch=True)
        return loss

    def training_step(
        self,
        batch: tuple[torch.Tensor, ...],
        batch_idx: int,
    ) -> torch.Tensor:
        return self._step(batch, "train")

    def validation_step(
        self,
        batch: tuple[torch.Tensor, ...],
        batch_idx: int,
    ) -> torch.Tensor:
        return self._step(batch, "val")

    def configure_optimizers(self) -> Any:
        return torch.optim.Adam(self.parameters(), lr=self.lr)


def build_dataloaders(
    X_train: torch.Tensor,
    y_train: torch.Tensor,
    strategy_train: torch.Tensor,
    horizon_train: torch.Tensor,
    X_val: torch.Tensor,
    y_val: torch.Tensor,
    strategy_val: torch.Tensor,
    horizon_val: torch.Tensor,
    batch_size: int = 32,
) -> tuple[DataLoader, DataLoader]:
    """Строит DataLoader для train и val. strategy/horizon — индексы 0..2."""
    train_ds = TensorDataset(X_train, strategy_train, horizon_train, y_train)
    val_ds = TensorDataset(X_val, strategy_val, horizon_val, y_val)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)
    return train_loader, val_loader
