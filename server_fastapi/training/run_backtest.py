"""
Запуск walk-forward бэктеста по чекпоинту CondMLP.

Использование:
  python -m training.run_backtest --checkpoint ./models/python_nn/cond_mlp-xx.ckpt [--splits 5] [--csv path]

Строит данные из пайплайна, разбивает по времени на n_splits окон, на каждом тестовом окне
вызывает evaluate_model_on_test, выводит средние метрики и при наличии MLflow логирует их.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from training.config import get_training_settings
from training.data.pipeline import build_feature_pipeline, time_based_split
from training.data.loaders import load_candles_from_csv
from training.backtest import walk_forward_split, evaluate_model_on_test


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
) -> dict[str, float]:
    """
    Выполняет walk-forward бэктест: разбивает данные на n_splits окон, на каждом тесте
    оценивает модель, возвращает средние по окнам test_mse, test_mae, test_direction_accuracy.
    """
    path = Path(checkpoint_path)
    if not path.is_file():
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    if candles_df is not None and not candles_df.empty:
        X, y = build_feature_pipeline(
            candles_df, lookback_days=lookback_days, prediction_horizon=prediction_horizon
        )
    else:
        X, y = _synthetic_data(lookback=lookback_days, horizon=prediction_horizon)

    if X.empty or len(X) < n_splits + 1:
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    results: list[dict[str, float]] = []
    for X_train, y_train, X_test, y_test in walk_forward_split(X, y, n_splits=n_splits):
        X_te = torch.tensor(X_test.values, dtype=torch.float32)
        y_te = torch.tensor(y_test.values, dtype=torch.float32)
        metrics = evaluate_model_on_test(
            path, X_te, y_te, strategy_id=strategy_id, horizon_id=horizon_id
        )
        results.append(metrics)

    if not results:
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}

    mean_mse = float(np.nanmean([r["test_mse"] for r in results]))
    mean_mae = float(np.nanmean([r["test_mae"] for r in results]))
    mean_dir = float(np.nanmean([r["test_direction_accuracy"] for r in results]))
    out = {"test_mse": mean_mse, "test_mae": mean_mae, "test_direction_accuracy": mean_dir}

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
