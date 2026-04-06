"""Тесты весов для дисбаланса flat/up/down в обучении NN."""

import torch

from training.sample_weights import movement_bucket_weights


def test_movement_bucket_weights_inverse_frequency() -> None:
    y = torch.tensor([0.0, 0.0, 0.0, 0.01, -0.01], dtype=torch.float32)
    w = movement_bucket_weights(y, flat_eps=1e-3)
    assert w.shape == (5,)
    # три flat, один up, один down — вес flat отличается от up/down; при симметрии up/down веса могут совпасть
    assert w[0] == w[1] == w[2]
    assert w[0] != w[3]
    assert torch.all(w > 0)


def test_movement_bucket_weights_empty() -> None:
    y = torch.tensor([], dtype=torch.float32)
    w = movement_bucket_weights(y)
    assert w.numel() == 0
