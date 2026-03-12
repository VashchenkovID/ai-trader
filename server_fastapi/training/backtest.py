"""
Бэктест и оценка модели на отложенной тестовой выборке.

- evaluate_model_on_test: загрузка чекпоинта, предсказание на X_test, метрики (MSE, MAE, направление).
- walk_forward_split: разбиение по времени на n_splits окон для walk-forward оценки.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

import pandas as pd
import torch

from training.inference_nn import load_model_and_predict


def evaluate_model_on_test(
    ckpt_path: str | Path,
    X_test: torch.Tensor,
    y_test: torch.Tensor,
    strategy_id: int = 1,
    horizon_id: int = 1,
) -> dict[str, float]:
    """
    Оценивает модель на тестовой выборке. Загружает чекпоинт, предсказывает score,
    сравнивает с y_test (реальная доходность).

    Returns:
        Словарь с ключами: test_mse, test_mae, test_direction_accuracy (доля совпадения знака).
    """
    path = Path(ckpt_path)
    if not path.is_file():
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}
    score, _ = load_model_and_predict(path, X_test, strategy_id=strategy_id, horizon_id=horizon_id)
    score = score.cpu().numpy()
    y_np = y_test.cpu().numpy() if isinstance(y_test, torch.Tensor) else y_test
    mse = float(((score - y_np) ** 2).mean())
    mae = float((score - y_np).__abs__().mean())
    # Направление: знак(score - 0.5) vs знак(y). Для регрессии доходности: sign(y) vs sign(score - 0.5)
    pred_sign = (score > 0.5).astype(float) * 2 - 1  # -1, 1
    true_sign = (y_np > 0).astype(float) * 2 - 1
    direction_accuracy = float((pred_sign == true_sign).mean())
    return {"test_mse": mse, "test_mae": mae, "test_direction_accuracy": direction_accuracy}


def walk_forward_split(
    X: pd.DataFrame,
    y: pd.Series,
    n_splits: int = 5,
) -> Iterator[tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]]:
    """
    Разбиение по времени на n_splits окон: train на первых k отрезках, test на (k+1)-м.
    Предполагается, что X и y отсортированы по дате (индекс).

    Yields:
        (X_train, y_train, X_test, y_test) для каждого шага k = 1 .. n_splits-1.
    """
    if X.empty or len(X) < n_splits + 1:
        return
    n = len(X)
    size = n // n_splits
    for k in range(1, n_splits):
        train_end = k * size
        test_end = min((k + 1) * size, n) if k + 1 < n_splits else n
        if test_end <= train_end:
            continue
        X_train = X.iloc[:train_end]
        y_train = y.loc[X_train.index]
        X_test = X.iloc[train_end:test_end]
        y_test = y.loc[X_test.index]
        if X_test.empty:
            continue
        yield X_train, y_train, X_test, y_test
