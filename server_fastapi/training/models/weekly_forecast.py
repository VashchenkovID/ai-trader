"""
Weekly forecast: encoder-decoder LSTM для прогноза на неделю вперёд.

Вход: скользящее окно фичей (seq_len дней). Выход: прогноз на 5–7 дней (например, return или close).
Опционально: фича «консенсус LLM» или пост-коррекция (см. план).
"""

from __future__ import annotations

import torch
import torch.nn as nn


class WeeklyForecastLSTM(nn.Module):
    """
    Encoder: LSTM на последовательности фичей. Decoder: LSTM или FC по последнему hidden
    выдаёт прогноз на n_forecast шагов (например 5 или 7 дней).
    """

    def __init__(
        self,
        input_size: int,
        hidden_size: int = 32,
        num_layers: int = 1,
        n_forecast: int = 5,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.n_forecast = n_forecast
        self.encoder = nn.LSTM(
            input_size,
            hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        self.decoder = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, n_forecast),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch, seq_len, input_size). Возвращает (batch, n_forecast) — прогноз на n_forecast дней.
        """
        _, (h_n, _) = self.encoder(x)
        last_hidden = h_n[-1]
        return self.decoder(last_hidden)
