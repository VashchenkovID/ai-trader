"""
Точка входа для обучения контура Weekly forecast (LSTM на последовательностях).

Использование:
  python -m training.run_weekly [--epochs 20] [--csv path/to/candles.csv]

Строит последовательности через build_weekly_sequences, обучает WeeklyForecastLSTM,
сохраняет чекпоинт в TRAINING_MODELS_ROOT/weekly/ и логирует в MLflow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import pytorch_lightning as pl
from pytorch_lightning.callbacks import ModelCheckpoint

from training.config import get_training_settings
from training.data.pipeline import build_weekly_sequences
from training.data.loaders import load_candles_from_csv
from training.experiments import init_mlflow
from training.logs_rollup import append_lightning_rollup, prune_lightning_raw_dirs
from training.models.weekly_lightning import WeeklyForecastLightning, build_weekly_dataloaders


def _synthetic_weekly_data(
    seq_len: int = 30,
    n_forecast: int = 5,
    n_days: int = 200,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Синтетические последовательности для теста обучения."""
    dates = pd.date_range("2020-01-01", periods=n_days, freq="D")
    close = 100 + np.cumsum(np.random.randn(len(dates)).astype(np.float32) * 0.5)
    volume = np.ones(len(dates), dtype=np.float32) * 1e6
    candles = pd.DataFrame({"close": close, "volume": volume}, index=dates)
    X_seq, y = build_weekly_sequences(
        candles,
        seq_len=seq_len,
        n_forecast=n_forecast,
    )
    if X_seq.shape[0] == 0:
        raise RuntimeError("Synthetic weekly sequences are empty")
    n = len(y)
    t1 = int(n * 0.7)
    t2 = int(n * 0.85)
    X_t = torch.tensor(X_seq[:t1], dtype=torch.float32)
    y_t = torch.tensor(y[:t1], dtype=torch.float32)
    X_v = torch.tensor(X_seq[t1:t2], dtype=torch.float32)
    y_v = torch.tensor(y[t1:t2], dtype=torch.float32)
    return X_t, y_t, X_v, y_v


def _candles_to_weekly_tensors(
    candles: pd.DataFrame,
    llm_aggregates: pd.DataFrame | None = None,
    seq_len: int = 30,
    n_forecast: int = 5,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Строит последовательности из свечей и возвращает train/val тензоры."""
    X_seq, y = build_weekly_sequences(
        candles,
        llm_aggregates=llm_aggregates,
        seq_len=seq_len,
        n_forecast=n_forecast,
    )
    if X_seq.shape[0] == 0:
        raise RuntimeError("Pipeline produced empty weekly sequences from candles")
    n = len(y)
    t1 = int(n * train_ratio)
    t2 = int(n * (train_ratio + val_ratio))
    X_t = torch.tensor(X_seq[:t1], dtype=torch.float32)
    y_t = torch.tensor(y[:t1], dtype=torch.float32)
    X_v = torch.tensor(X_seq[t1:t2], dtype=torch.float32)
    y_v = torch.tensor(y[t1:t2], dtype=torch.float32)
    return X_t, y_t, X_v, y_v


def run(
    max_epochs: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    experiment_name: str | None = None,
    candles_df: pd.DataFrame | None = None,
    seq_len: int = 30,
    n_forecast: int = 5,
    resume_from_latest: bool = False,
) -> str | None:
    """
    Запускает обучение Weekly forecast. Возвращает run_id MLflow или None.

    Если передан candles_df, обучение по реальным данным; иначе синтетика.
    """
    settings = get_training_settings()
    init_mlflow(experiment_name=experiment_name or settings.mlflow_experiment_name)
    import mlflow

    mlflow.set_experiment(experiment_name or settings.mlflow_experiment_name)

    if candles_df is not None and not candles_df.empty:
        X_t, y_t, X_v, y_v = _candles_to_weekly_tensors(
            candles_df,
            seq_len=seq_len,
            n_forecast=n_forecast,
        )
    else:
        X_t, y_t, X_v, y_v = _synthetic_weekly_data(
            seq_len=seq_len,
            n_forecast=n_forecast,
        )

    _, seq_len_actual, input_size = X_t.shape
    train_loader, val_loader = build_weekly_dataloaders(
        X_t, y_t, X_v, y_v, batch_size=batch_size
    )
    model = WeeklyForecastLightning(
        input_size=input_size,
        seq_len=seq_len_actual,
        n_forecast=n_forecast,
        lr=lr,
    )
    models_root = Path(settings.models_root)
    models_root.mkdir(parents=True, exist_ok=True)
    ckpt_dir = models_root / "weekly"
    ckpt_path = None
    if resume_from_latest:
        latest = sorted(ckpt_dir.glob("*.ckpt"), key=lambda p: p.stat().st_mtime)
        if latest:
            ckpt_path = str(latest[-1])
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_callback = ModelCheckpoint(
        dirpath=str(ckpt_dir),
        filename="weekly_lstm-{epoch:02d}-{val_loss:.4f}",
        save_top_k=1,
        monitor="val_loss",
        mode="min",
    )
    trainer = pl.Trainer(
        max_epochs=max_epochs,
        callbacks=[checkpoint_callback],
        enable_progress_bar=True,
    )
    with mlflow.start_run(run_name="weekly_forecast") as run:
        mlflow.log_params({
            "input_size": input_size,
            "seq_len": seq_len_actual,
            "n_forecast": n_forecast,
            "max_epochs": max_epochs,
            "batch_size": batch_size,
            "lr": lr,
            "data_source": "csv" if candles_df is not None and not candles_df.empty else "synthetic",
        })
        trainer.fit(model, train_loader, val_loader, ckpt_path=ckpt_path)
        best_model_path = checkpoint_callback.best_model_path or None
        if checkpoint_callback.best_model_path:
            mlflow.log_artifact(checkpoint_callback.best_model_path)
        append_lightning_rollup(
            settings=settings,
            training_type="weekly",
            run_id=run.info.run_id,
            checkpoint_path=best_model_path,
            params={
                "max_epochs": max_epochs,
                "batch_size": batch_size,
                "lr": lr,
                "seq_len": seq_len,
                "n_forecast": n_forecast,
            },
        )
        prune_lightning_raw_dirs(settings=settings)
        return run.info.run_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Weekly forecast LSTM")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--experiment", type=str, default=None)
    parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Путь к CSV со свечами. Без указания используется синтетика.",
    )
    parser.add_argument("--seq-len", type=int, default=30)
    parser.add_argument("--n-forecast", type=int, default=5)
    args = parser.parse_args()
    candles_df = None
    if args.csv:
        candles_df = load_candles_from_csv(args.csv)
        if candles_df.empty:
            raise SystemExit(f"Не удалось загрузить свечи из {args.csv}")
    run_id = run(
        max_epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        experiment_name=args.experiment,
        candles_df=candles_df,
        seq_len=args.seq_len,
        n_forecast=args.n_forecast,
    )
    print("MLflow run_id:", run_id)


if __name__ == "__main__":
    main()
