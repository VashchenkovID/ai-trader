"""
Точка входа для обучения базового контура NN с conditioning.

Использование:
  python -m training.run_nn [--epochs 20] [--figi FIGI]

Читает данные из пайплайна по реальным свечам (CSV/DB),
обучает CondMLP с strategy_id/horizon_id, сохраняет чекпоинт и логирует в MLflow.
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import pytorch_lightning as pl
from pytorch_lightning.callbacks import ModelCheckpoint

from training.config import get_training_settings
from training.data.pipeline import build_feature_pipeline, time_based_split
from training.data.loaders import load_candles_from_csv
from training.experiments import init_mlflow
from training.logs_rollup import append_lightning_rollup, prune_lightning_raw_dirs
from training.models.nn import CondMLP
from training.models.lightning_module import CondMLPLightning, build_dataloaders
from training.sample_weights import movement_bucket_weights
from training.backtest import evaluate_model_on_test

logger = logging.getLogger(__name__)


def _candles_to_tensors(
    candles: pd.DataFrame,
    options_df: pd.DataFrame | None = None,
    signals_df: pd.DataFrame | None = None,
    lookback: int = 60,
    horizon: int = 5,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Строит фичи из свечей и возвращает тензоры train/val/test для обучения и бэктеста."""
    X, y = build_feature_pipeline(
        candles,
        options=options_df,
        signals=signals_df,
        lookback_days=lookback,
        prediction_horizon=horizon,
    )
    if X.empty:
        raise RuntimeError("Pipeline produced empty X from candles")
    X_train, y_train, X_val, y_val, X_test, y_test = time_based_split(X, y)
    n_train, n_val, n_test = len(X_train), len(X_val), len(X_test)
    strategy_train = torch.randint(0, 3, (n_train,))
    horizon_train = torch.randint(0, 3, (n_train,))
    strategy_val = torch.randint(0, 3, (n_val,))
    horizon_val = torch.randint(0, 3, (n_val,))
    strategy_test = torch.randint(0, 3, (n_test,)) if n_test else torch.zeros(0, dtype=torch.long)
    horizon_test = torch.randint(0, 3, (n_test,)) if n_test else torch.zeros(0, dtype=torch.long)
    X_t = torch.tensor(X_train.values, dtype=torch.float32)
    y_t = torch.tensor(y_train.values, dtype=torch.float32)
    X_v = torch.tensor(X_val.values, dtype=torch.float32)
    y_v = torch.tensor(y_val.values, dtype=torch.float32)
    X_te = torch.tensor(X_test.values, dtype=torch.float32) if n_test else torch.zeros(0, X.shape[1], dtype=torch.float32)
    y_te = torch.tensor(y_test.values, dtype=torch.float32) if n_test else torch.zeros(0, dtype=torch.float32)
    return X_t, y_t, strategy_train, horizon_train, X_v, y_v, strategy_val, horizon_val, X_te, y_te, strategy_test, horizon_test


def _checkpoint_input_size(path: Path) -> int | None:
    try:
        payload = torch.load(path, map_location="cpu")
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    hp = payload.get("hyper_parameters")
    if not isinstance(hp, dict):
        return None
    value = hp.get("input_size")
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _select_compatible_checkpoint(ckpt_dir: Path, *, input_size: int) -> str | None:
    if not ckpt_dir.exists():
        return None
    latest = sorted(ckpt_dir.glob("*.ckpt"), key=lambda p: p.stat().st_mtime, reverse=True)
    for ckpt in latest:
        if _checkpoint_input_size(ckpt) == int(input_size):
            return str(ckpt)
    return None


def run(
    max_epochs: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    experiment_name: str | None = None,
    candles_df: pd.DataFrame | None = None,
    lookback_days: int = 60,
    prediction_horizon: int = 5,
    resume_from_latest: bool = False,
    options_df: pd.DataFrame | None = None,
    signals_df: pd.DataFrame | None = None,
    *,
    imbalance_weighted: bool = False,
    flat_threshold: float = 5e-4,
    focal_gamma: float = 0.0,
) -> str | None:
    """
    Запускает обучение NN с conditioning. Возвращает run_id MLflow или None.

    Обучение допустимо только по реальным данным (candles_df).
    """
    settings = get_training_settings()
    init_mlflow(experiment_name=experiment_name or settings.mlflow_experiment_name)
    import mlflow
    mlflow.set_experiment(experiment_name or settings.mlflow_experiment_name)

    if candles_df is None or candles_df.empty:
        raise RuntimeError("Synthetic data is disabled: NN training requires real candles_df")
    X_t, y_t, s_t, h_t, X_v, y_v, s_v, h_v, X_te, y_te, s_te, h_te = _candles_to_tensors(
        candles_df,
        options_df=options_df,
        signals_df=signals_df,
        lookback=lookback_days,
        horizon=prediction_horizon,
    )
    input_size = X_t.shape[1]
    train_weights = None
    if imbalance_weighted and y_t.shape[0] > 0:
        train_weights = movement_bucket_weights(y_t, flat_eps=flat_threshold)
    train_loader, val_loader = build_dataloaders(
        X_t,
        y_t,
        s_t,
        h_t,
        X_v,
        y_v,
        s_v,
        h_v,
        batch_size=batch_size,
        train_sample_weights=train_weights,
    )
    model = CondMLPLightning(
        input_size=input_size,
        lr=lr,
        weighted_training=imbalance_weighted,
        focal_gamma=focal_gamma,
    )
    models_root = Path(settings.models_root)
    models_root.mkdir(parents=True, exist_ok=True)
    ckpt_dir = models_root / "python_nn"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = None
    if resume_from_latest:
        ckpt_path = _select_compatible_checkpoint(ckpt_dir, input_size=input_size)
        if ckpt_path is None:
            logger.info("No compatible NN checkpoint for input_size=%s; start fresh", input_size)
    checkpoint_callback = ModelCheckpoint(
        dirpath=str(ckpt_dir),
        filename="cond_mlp-{epoch:02d}-{val_loss:.4f}",
        save_top_k=1,
        monitor="val_loss",
        mode="min",
    )
    trainer = pl.Trainer(
        max_epochs=max_epochs,
        callbacks=[checkpoint_callback],
        enable_progress_bar=True,
    )
    with mlflow.start_run(run_name="cond_mlp") as run:
        mlflow.log_params({
            "input_size": input_size,
            "max_epochs": max_epochs,
            "batch_size": batch_size,
            "lr": lr,
            "data_source": "real_db",
            "options_features_enabled": bool(options_df is not None and not options_df.empty),
            "imbalance_weighted": imbalance_weighted,
            "flat_threshold": flat_threshold,
            "focal_gamma": focal_gamma,
        })
        trainer.fit(model, train_loader, val_loader, ckpt_path=ckpt_path)
        best_model_path = checkpoint_callback.best_model_path or None
        if checkpoint_callback.best_model_path:
            mlflow.log_artifact(checkpoint_callback.best_model_path)
            if X_te.shape[0] > 0:
                test_metrics = evaluate_model_on_test(
                    checkpoint_callback.best_model_path,
                    X_te,
                    y_te,
                    strategy_id=1,
                    horizon_id=1,
                )
                for k, v in test_metrics.items():
                    mlflow.log_metric(k, v)
        append_lightning_rollup(
            settings=settings,
            training_type="nn",
            run_id=run.info.run_id,
            checkpoint_path=best_model_path,
            params={
                "max_epochs": max_epochs,
                "batch_size": batch_size,
                "lr": lr,
                "lookback_days": lookback_days,
                "prediction_horizon": prediction_horizon,
                "imbalance_weighted": imbalance_weighted,
                "flat_threshold": flat_threshold,
                "focal_gamma": focal_gamma,
            },
        )
        prune_lightning_raw_dirs(settings=settings)
        return run.info.run_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NN with conditioning")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--experiment", type=str, default=None)
    parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Путь к CSV со свечами (candle_time/date, close, volume). Обязательно.",
    )
    parser.add_argument("--lookback", type=int, default=60)
    parser.add_argument("--horizon", type=int, default=5)
    parser.add_argument(
        "--imbalance-weighted",
        action="store_true",
        help="Веса по бакетам flat/up/down для forward return (см. training/sample_weights.py)",
    )
    parser.add_argument(
        "--flat-threshold",
        type=float,
        default=5e-4,
        help="Порог |return| для бакета «flat» при --imbalance-weighted",
    )
    parser.add_argument(
        "--focal-gamma",
        type=float,
        default=0.0,
        help="Focal-модификатор MSE (0=выкл.; чем больше, тем сильнее фокус на трудных примерах)",
    )
    args = parser.parse_args()
    if not args.csv:
        raise SystemExit("Synthetic data is disabled: pass --csv with real candles")
    candles_df = load_candles_from_csv(args.csv)
    if candles_df.empty:
        raise SystemExit(f"Не удалось загрузить свечи из {args.csv}")
    run_id = run(
        max_epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        experiment_name=args.experiment,
        candles_df=candles_df,
        lookback_days=args.lookback,
        prediction_horizon=args.horizon,
        imbalance_weighted=args.imbalance_weighted,
        flat_threshold=args.flat_threshold,
        focal_gamma=args.focal_gamma,
    )
    print("MLflow run_id:", run_id)


if __name__ == "__main__":
    main()
