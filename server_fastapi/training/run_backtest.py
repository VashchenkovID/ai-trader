"""
Запуск walk-forward бэктеста по чекпоинту CondMLP.

Использование:
  python -m training.run_backtest --checkpoint ./models/python_nn/cond_mlp-xx.ckpt [--splits 5] [--csv path]

Строит данные из пайплайна, разбивает по времени на n_splits окон, на каждом тестовом окне
вызывает evaluate_model_on_test, выводит средние метрики и при наличии MLflow логирует их.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch

from training.config import get_training_settings
from training.data.pipeline import build_feature_pipeline
from training.data.loaders import load_candles_from_csv
from training.backtest import walk_forward_split, evaluate_model_on_test
from training.run_stacking import _checkpoint_input_size, _find_compatible_base_checkpoint


def _synthetic_data(n_samples: int = 500, lookback: int = 60, horizon: int = 5):
    """Синтетические X (DataFrame с индексом), y (Series) для walk-forward."""
    dates = pd.date_range("2020-01-01", periods=n_samples + lookback + horizon, freq="D")
    close = 100 + np.cumsum(np.random.randn(len(dates)).astype(np.float32) * 0.5)
    volume = np.ones(len(dates), dtype=np.float32) * 1e6
    candles = pd.DataFrame({"close": close, "volume": volume}, index=dates)
    X, y = build_feature_pipeline(candles, lookback_days=lookback, prediction_horizon=horizon)
    return X, y


def run(
    checkpoint_path: str | Path,
    n_splits: int = 5,
    strategy_id: int = 1,
    horizon_id: int = 1,
    candles_df: pd.DataFrame | None = None,
    lookback_days: int = 60,
    prediction_horizon: int = 5,
    log_mlflow: bool = True,
    *,
    options: pd.DataFrame | None = None,
    signals: pd.DataFrame | None = None,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, float]:
    """
    Выполняет walk-forward бэктест: разбивает данные на n_splits окон, на каждом тесте
    оценивает модель, возвращает средние по окнам test_mse, test_mae, test_direction_accuracy.
    """
    path = Path(checkpoint_path)
    if not path.is_file():
        if on_progress:
            on_progress({"message": "Чекпоинт не найден", "phase": "error"})
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    if on_progress:
        on_progress({"message": "Подготовка данных для walk-forward...", "phase": "prepare"})

    if candles_df is not None and not candles_df.empty:
        X, y = build_feature_pipeline(
            candles_df,
            options=options,
            signals=signals,
            lookback_days=lookback_days,
            prediction_horizon=prediction_horizon,
        )
    else:
        X, y = _synthetic_data(lookback=lookback_days, horizon=prediction_horizon)

    if X.empty or len(X) < n_splits + 1:
        if on_progress:
            on_progress({"message": "Недостаточно данных для walk-forward", "phase": "skipped"})
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    # Согласовать размерность фич с CondMLP: сначала ищем чекпоинт под фактический n_features,
    # иначе обрезаем X до input_size из переданного чекпоинта (типично 4+5 opt без лишних sig).
    n_features = int(X.shape[1])
    ckpt_in = _checkpoint_input_size(path)
    if ckpt_in is not None and n_features != ckpt_in:
        alt = _find_compatible_base_checkpoint(path, n_features)
        if alt is not None:
            path = alt
            if on_progress:
                on_progress(
                    {
                        "message": f"Чекпоинт заменён на совместимый с input_size={n_features}",
                        "phase": "checkpoint",
                        "checkpoint": str(path),
                    }
                )
        elif n_features > ckpt_in:
            X = X.iloc[:, :ckpt_in]
            if on_progress:
                on_progress(
                    {
                        "message": (
                            f"Фичи обрезаны с {n_features} до {ckpt_in} под веса чекпоинта"
                        ),
                        "phase": "features_trim",
                        "inputSize": ckpt_in,
                    }
                )
        else:
            if on_progress:
                on_progress(
                    {
                        "message": (
                            f"Несовпадение фич: X={n_features}, чекпоинт ожидает {ckpt_in}"
                        ),
                        "phase": "skipped",
                    }
                )
            return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    if on_progress:
        on_progress(
            {
                "message": f"Walk-forward: {n_splits} окон, оценка модели по тестовым окнам",
                "phase": "walk_forward",
                "splitTotal": n_splits,
            }
        )

    results: list[dict[str, float]] = []
    for split_idx, (X_train, y_train, X_test, y_test) in enumerate(
        walk_forward_split(X, y, n_splits=n_splits), start=1
    ):
        if on_progress:
            on_progress(
                {
                    "message": f"Окно {split_idx}/{n_splits}: оценка на тесте",
                    "phase": "eval",
                    "splitIndex": split_idx,
                    "splitTotal": n_splits,
                }
            )
        X_te = torch.tensor(X_test.values, dtype=torch.float32)
        y_te = torch.tensor(y_test.values, dtype=torch.float32)
        metrics = evaluate_model_on_test(
            path, X_te, y_te, strategy_id=strategy_id, horizon_id=horizon_id
        )
        results.append(metrics)

    if not results:
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    mse_values = [float(r.get("test_mse", float("nan"))) for r in results]
    mae_values = [float(r.get("test_mae", float("nan"))) for r in results]
    dir_values = [float(r.get("test_direction_accuracy", float("nan"))) for r in results]

    has_any_mse = any(not np.isnan(v) for v in mse_values)
    has_any_mae = any(not np.isnan(v) for v in mae_values)
    has_any_dir = any(not np.isnan(v) for v in dir_values)
    if not (has_any_mse or has_any_mae or has_any_dir):
        if on_progress:
            on_progress(
                {
                    "message": "Все окна дали NaN-метрики: инструмент пропущен",
                    "phase": "skipped",
                }
            )
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    mean_mse = float(np.nanmean(mse_values)) if has_any_mse else float("nan")
    mean_mae = float(np.nanmean(mae_values)) if has_any_mae else float("nan")
    mean_dir = float(np.nanmean(dir_values)) if has_any_dir else float("nan")
    out = {"test_mse": mean_mse, "test_mae": mean_mae, "test_direction_accuracy": mean_dir}

    if on_progress:
        on_progress(
            {
                "message": (
                    f"Итог: MSE={mean_mse:.6f}, MAE={mean_mae:.6f}, "
                    f"dir_acc={mean_dir:.4f}"
                ),
                "phase": "done",
                "metrics": out,
            }
        )

    if log_mlflow:
        try:
            import mlflow
            from training.experiments import init_mlflow
            settings = get_training_settings()
            init_mlflow()
            mlflow.set_experiment(settings.mlflow_experiment_name)
            with mlflow.start_run(run_name="walk_forward_backtest") as run:
                mlflow.log_params({
                    "checkpoint": str(path),
                    "n_splits": n_splits,
                    "strategy_id": strategy_id,
                    "horizon_id": horizon_id,
                })
                for k, v in out.items():
                    mlflow.log_metric(k, v)
        except Exception:
            pass

    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Walk-forward backtest for CondMLP")
    parser.add_argument("--checkpoint", type=str, required=True, help="Путь к чекпоинту CondMLP")
    parser.add_argument("--splits", type=int, default=5)
    parser.add_argument("--strategy-id", type=int, default=1)
    parser.add_argument("--horizon-id", type=int, default=1)
    parser.add_argument("--csv", type=str, default=None)
    parser.add_argument("--lookback", type=int, default=60)
    parser.add_argument("--horizon", type=int, default=5)
    parser.add_argument("--no-mlflow", action="store_true", help="Не логировать в MLflow")
    args = parser.parse_args()
    candles_df = None
    if args.csv:
        candles_df = load_candles_from_csv(args.csv)
        if candles_df.empty:
            raise SystemExit(f"Не удалось загрузить свечи из {args.csv}")
    metrics = run(
        checkpoint_path=args.checkpoint,
        n_splits=args.splits,
        strategy_id=args.strategy_id,
        horizon_id=args.horizon_id,
        candles_df=candles_df,
        lookback_days=args.lookback,
        prediction_horizon=args.horizon,
        log_mlflow=not args.no_mlflow,
    )
    print("Walk-forward backtest metrics:", metrics)


if __name__ == "__main__":
    main()
