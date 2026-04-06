"""
Веса объектов для обучения CondMLP при дисбалансе «плоских» vs сильных движений.

Метка y — forward return (как в build_feature_pipeline). Бакеты:
- flat: |y| < flat_eps
- up: y > flat_eps
- down: y < -flat_eps

Вес = n / (K * n_c), K=3, инверсия частоты в батче (на всём train считается в run_nn).
"""

from __future__ import annotations

import torch


def movement_bucket_weights(y: torch.Tensor, flat_eps: float = 5e-4) -> torch.Tensor:
    """
    Возвращает веса (batch,) с обратной частотой по трём бакетам на всей выборке y.

    Args:
        y: тензор меток доходности, форма (N,) или (N, 1).
        flat_eps: порог «плоского» движения в долях (например 0.0005 = 5 bps).
    """
    y = y.detach().reshape(-1).float()
    n = y.numel()
    if n == 0:
        return y
    device = y.device
    flat = y.abs() < flat_eps
    up = y > flat_eps
    down = y < -flat_eps
    n_flat = flat.sum().float().clamp(min=1.0)
    n_up = up.sum().float().clamp(min=1.0)
    n_down = down.sum().float().clamp(min=1.0)
    k = 3.0
    w_flat = float(n) / (k * float(n_flat))
    w_up = float(n) / (k * float(n_up))
    w_down = float(n) / (k * float(n_down))
    w_flat_t = torch.tensor(w_flat, device=device, dtype=y.dtype)
    w_up_t = torch.tensor(w_up, device=device, dtype=y.dtype)
    w_down_t = torch.tensor(w_down, device=device, dtype=y.dtype)
    return torch.where(flat, w_flat_t, torch.where(up, w_up_t, w_down_t))
