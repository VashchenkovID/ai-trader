"""
Lightning-модуль для обучения WeeklyForecastLSTM.

Метка: один forward return на горизонте n_forecast дней. Loss: MSE по предсказанному return
(модель выдаёт n_forecast значений — усредняем в один для совпадения с меткой).
"""

from __future__ import annotations

from typing import Any

import torch
import pytorch_lightning as pl
from torch.utils.data import DataLoader, TensorDataset

from training.models.weekly_forecast import WeeklyForecastLSTM


class WeeklyForecastLightning(pl.LightningModule):
    """Обучение WeeklyForecastLSTM на последовательностях (batch, seq_len, input_size)."""

    def __init__(
        self,
        input_size: int,
        seq_len: int = 30,
        hidden_size: int = 32,
        num_layers: int = 1,
        n_forecast: int = 5,
        dropout: float = 0.1,
        lr: float = 1e-3,
    ):
        super().__init__()
        self.save_hyperparameters()
        self.model = WeeklyForecastLSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            n_forecast=n_forecast,
            dropout=dropout,
        )
        self.lr = lr
        self.n_forecast = n_forecast

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, seq_len, input_size). Возвращает (batch, n_forecast)."""
        return self.model(x)

    def _step(
        self,
        batch: tuple[torch.Tensor, torch.Tensor],
        prefix: str,
    ) -> torch.Tensor:
        x, target = batch
        out = self.model(x)
        pred = out.mean(dim=1)
        loss = torch.nn.functional.mse_loss(pred, target)
        self.log(f"{prefix}_loss", loss, on_step=False, on_epoch=True)
        return loss

    def training_step(
        self,
        batch: tuple[torch.Tensor, torch.Tensor],
        batch_idx: int,
    ) -> torch.Tensor:
        return self._step(batch, "train")

    def validation_step(
        self,
        batch: tuple[torch.Tensor, torch.Tensor],
        batch_idx: int,
    ) -> torch.Tensor:
        return self._step(batch, "val")

    def configure_optimizers(self) -> Any:
        return torch.optim.Adam(self.parameters(), lr=self.lr)


def build_weekly_dataloaders(
    X_train: torch.Tensor,
    y_train: torch.Tensor,
    X_val: torch.Tensor,
    y_val: torch.Tensor,
    batch_size: int = 32,
) -> tuple[DataLoader, DataLoader]:
    """Строит DataLoader для train и val. X: (n, seq_len, n_features), y: (n,)."""
    train_ds = TensorDataset(X_train, y_train)
    val_ds = TensorDataset(X_val, y_val)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)
    return train_loader, val_loader
