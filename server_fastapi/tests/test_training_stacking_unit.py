from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import torch
import pandas as pd

from training.models.nn import N_HORIZONS, N_STRATEGIES
from training.run_stacking import build_meta_features, run


class _FakeBase(torch.nn.Module):
    def forward(self, x: torch.Tensor, sid: torch.Tensor, hid: torch.Tensor):
        score = torch.full((x.shape[0],), 0.1, device=x.device)
        conf = torch.full((x.shape[0],), 0.9, device=x.device)
        return score, conf


def test_build_meta_features_shape() -> None:
    x = torch.randn(4, 10)
    device = torch.device("cpu")
    out = build_meta_features(_FakeBase(), x, device)
    assert out.shape == (4, N_STRATEGIES * N_HORIZONS * 2)


def test_run_stacking_returns_none_if_checkpoint_missing(tmp_path: Path) -> None:
    out = run(base_checkpoint_path=tmp_path / "missing.ckpt", max_epochs=1)
    assert out is None


def test_run_stacking_happy_path_with_mocks(tmp_path: Path, monkeypatch) -> None:
    base_ckpt = tmp_path / "base.ckpt"
    base_ckpt.write_text("ok", encoding="utf-8")

    x_train = torch.randn(6, 10)
    y_train = torch.randn(6)
    x_val = torch.randn(4, 10)
    y_val = torch.randn(4)

    def _fake_tensors(*_args, **_kwargs):
        return x_train, y_train, torch.zeros(6), torch.zeros(6), x_val, y_val, torch.zeros(4), torch.zeros(4), torch.zeros(0, 10), torch.zeros(0), torch.zeros(0), torch.zeros(0)

    class _RunCtx:
        def __enter__(self):
            return SimpleNamespace(info=SimpleNamespace(run_id="run1"))

        def __exit__(self, exc_type, exc, tb):
            return False

    fake_mlflow = SimpleNamespace(
        set_experiment=lambda *_args, **_kwargs: None,
        start_run=lambda **_kwargs: _RunCtx(),
        log_params=lambda *_args, **_kwargs: None,
        log_artifact=lambda *_args, **_kwargs: None,
    )

    monkeypatch.setattr("training.run_stacking.load_cond_mlp", lambda *_args, **_kwargs: _FakeBase())
    monkeypatch.setattr("training.run_nn._candles_to_tensors", _fake_tensors)
    monkeypatch.setattr("training.run_stacking._find_compatible_base_checkpoint", lambda *_a, **_k: base_ckpt)
    monkeypatch.setattr("training.experiments.init_mlflow", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "training.run_stacking.get_training_settings",
        lambda: SimpleNamespace(models_root=str(tmp_path), mlflow_experiment_name="exp"),
    )
    monkeypatch.setattr(
        "training.run_stacking.build_meta_features",
        lambda _m, x, _d: torch.randn(x.shape[0], 18),
    )
    monkeypatch.setitem(__import__("sys").modules, "mlflow", fake_mlflow)

    candles = pd.DataFrame({"close": [100.0] * 120, "volume": [1_000_000] * 120})
    out = run(base_checkpoint_path=base_ckpt, max_epochs=1, batch_size=2, candles_df=candles)
    assert out is not None
    assert out.endswith(".pt")


def test_run_stacking_returns_none_on_empty_train_loader(tmp_path: Path, monkeypatch) -> None:
    base_ckpt = tmp_path / "base.ckpt"
    base_ckpt.write_text("ok", encoding="utf-8")

    def _tiny_tensors(*_args, **_kwargs):
        return (
            torch.zeros((0, 10)),
            torch.zeros((0,)),
            torch.zeros((0,)),
            torch.zeros((0,)),
            torch.zeros((1, 10)),
            torch.zeros((1,)),
            torch.zeros((1,)),
            torch.zeros((1,)),
            torch.zeros((0, 10)),
            torch.zeros((0,)),
            torch.zeros((0,)),
            torch.zeros((0,)),
        )

    monkeypatch.setattr("training.run_stacking.load_cond_mlp", lambda *_args, **_kwargs: _FakeBase())
    monkeypatch.setattr("training.run_nn._candles_to_tensors", _tiny_tensors)
    monkeypatch.setattr("training.run_stacking._find_compatible_base_checkpoint", lambda *_a, **_k: base_ckpt)
    monkeypatch.setattr(
        "training.run_stacking.get_training_settings",
        lambda: SimpleNamespace(models_root=str(tmp_path), mlflow_experiment_name="exp"),
    )
    candles = pd.DataFrame({"close": [100.0] * 120, "volume": [1_000_000] * 120})
    out = run(base_checkpoint_path=base_ckpt, max_epochs=1, batch_size=2, candles_df=candles)
    assert out is None
