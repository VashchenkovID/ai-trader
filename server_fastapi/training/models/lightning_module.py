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
        *,
        weighted_training: bool = False,
        focal_gamma: float = 0.0,
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
        self.weighted_training = weighted_training
        self.focal_gamma = float(focal_gamma)

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
        if self.weighted_training and len(batch) == 5:
            x, strategy_id, horizon_id, target, sample_weight = batch
        else:
            x, strategy_id, horizon_id, target = batch[:4]
            sample_weight = None
        score, confidence = self(x, strategy_id, horizon_id)
        # Нормализуем target в [0, 1] для регрессии (tanh-style: (1 + x) / 2, clamp)
        t = target.float().view_as(score)
        target_clamp = torch.clamp((1 + t) / 2, 0.0, 1.0)
        err = (score - target_clamp) ** 2
        if self.focal_gamma > 0:
            focal = (1.0 - torch.exp(-(score - target_clamp).abs())).pow(self.focal_gamma)
            err = err * focal
        if sample_weight is not None and prefix == "train":
            w = sample_weight.reshape_as(score)
            loss_score = (err * w).sum() / w.sum().clamp(min=1e-8)
        else:
            loss_score = err.mean()
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
    *,
    train_sample_weights: torch.Tensor | None = None,
) -> tuple[DataLoader, DataLoader]:
    """Строит DataLoader для train и val. strategy/horizon — индексы 0..2.

    Если train_sample_weights задан (длина = train), добавляет веса для weighted train loss.
    """
    if train_sample_weights is not None:
        train_ds = TensorDataset(
            X_train, strategy_train, horizon_train, y_train, train_sample_weights
        )
    else:
        train_ds = TensorDataset(X_train, strategy_train, horizon_train, y_train)
    val_ds = TensorDataset(X_val, strategy_val, horizon_val, y_val)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)
    return train_loader, val_loader
