"""
Инференс: загрузка обученной модели и предсказание score/confidence.

Использование:
  from training.inference_nn import load_model_and_predict
  score, confidence = load_model_and_predict(checkpoint_path, X_tensor, strategy_id=1, horizon_id=2)

  Ансамбль по всем парам (strategy, horizon):
  from training.inference_nn import load_ensemble_and_predict
  score, confidence = load_ensemble_and_predict(checkpoint_path, X_tensor, weights_path=None)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import torch

from training.models.nn import CondMLP, N_HORIZONS, N_STRATEGIES
from training.models.ensemble import EnsemblePredictor

logger = logging.getLogger(__name__)


def load_cond_mlp(checkpoint_path: str | Path) -> CondMLP:
    """
    Загружает CondMLP из чекпоинта Lightning.
    Использует hyper_parameters из чекпоинта, если есть; иначе восстанавливает input_size из state_dict.
    При strict=False логирует отсутствующие и лишние ключи.
    """
    path = Path(checkpoint_path)
    if not path.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {path}")
    ckpt = torch.load(path, map_location="cpu", weights_only=True)
    state = ckpt.get("state_dict", ckpt)
    state = {k.removeprefix("model."): v for k, v in state.items()}
    # Попытка взять гиперпараметры из чекпоинта Lightning
    hparams = ckpt.get("hyper_parameters") or {}
    input_size = hparams.get("input_size")
    if input_size is None:
        w = next(v for k, v in state.items() if "backbone" in k and "weight" in k)
        input_size = int(w.shape[1])
    hidden_sizes = hparams.get("hidden_sizes", (64, 32))
    embed_dim = hparams.get("embed_dim", 8)
    dropout = hparams.get("dropout", 0.1)
    jury_signal_indices = hparams.get("jury_signal_indices", None)
    model = CondMLP(
        input_size=input_size,
        hidden_sizes=list(hidden_sizes),
        embed_dim=embed_dim,
        dropout=dropout,
        jury_signal_indices=jury_signal_indices,
    )
    load_result = model.load_state_dict(state, strict=False)
    if load_result.missing_keys:
        logger.warning(
            "load_cond_mlp: missing keys in checkpoint %s: %s",
            path,
            load_result.missing_keys[:10],
        )
    if load_result.unexpected_keys:
        logger.warning(
            "load_cond_mlp: unexpected keys in checkpoint %s: %s",
            path,
            load_result.unexpected_keys[:10],
        )
    return model


def load_model_and_predict(
    checkpoint_path: str | Path,
    x: torch.Tensor,
    strategy_id: int | torch.Tensor = 1,
    horizon_id: int | torch.Tensor = 1,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Загружает модель из чекпоинта и возвращает (score, confidence) для входа x.
    x: (batch, n_features). strategy_id, horizon_id: int 0..2 или тензор формы (batch,).
    """
    model = load_cond_mlp(checkpoint_path)
    model.eval()
    batch = x.shape[0]
    device = x.device
    if isinstance(strategy_id, int):
        strategy_id = torch.full((batch,), strategy_id, dtype=torch.long, device=device)
    if isinstance(horizon_id, int):
        horizon_id = torch.full((batch,), horizon_id, dtype=torch.long, device=device)
    with torch.no_grad():
        score, confidence = model(x, strategy_id, horizon_id)
    return score, confidence


def load_ensemble_weights(path: str | Path) -> tuple[torch.Tensor, torch.Tensor] | None:
    """
    Загружает веса ансамбля из JSON.
    Ожидаемый формат: {"horizon_weights": [f, f, f], "strategy_weights": [f, f, f]}.
    Возвращает (horizon_weights, strategy_weights) тензоры или None при ошибке.
    """
    p = Path(path)
    if not p.is_file():
        return None
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        hw = data.get("horizon_weights")
        sw = data.get("strategy_weights")
        if hw is None or sw is None or len(hw) != N_HORIZONS or len(sw) != N_STRATEGIES:
            return None
        return torch.tensor(hw, dtype=torch.float32), torch.tensor(sw, dtype=torch.float32)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning("load_ensemble_weights: %s", e)
        return None


def load_ensemble_and_predict(
    checkpoint_path: str | Path,
    x: torch.Tensor,
    weights_path: str | Path | None = None,
    llm_consensus: float | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Загружает CondMLP из чекпоинта, оборачивает в EnsemblePredictor (все 9 пар strategy×horizon),
    возвращает агрегированные (score, confidence) для входа x.
    x: (batch, n_features). weights_path — путь к JSON с horizon_weights и strategy_weights (опционально).
    llm_consensus: опционально, для мета-весов (get_meta_weights); используется если weights_path не задан.
    """
    model = load_cond_mlp(checkpoint_path)
    model.eval()
    hw, sw = None, None
    if weights_path:
        loaded = load_ensemble_weights(weights_path)
        if loaded is not None:
            hw, sw = loaded
    if hw is None and sw is None and llm_consensus is not None:
        from training.models.meta import get_meta_weights
        hw, sw = get_meta_weights(llm_consensus=llm_consensus, device=x.device)
    ensemble = EnsemblePredictor(model, horizon_weights=hw, strategy_weights=sw)
    with torch.no_grad():
        score, confidence = ensemble.forward(x, aggregate=True)
    return score, confidence
