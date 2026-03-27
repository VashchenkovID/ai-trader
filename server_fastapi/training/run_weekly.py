"""
Точка входа для обучения контура Weekly forecast (LSTM на последовательностях).

Использование:
  python -m training.run_weekly [--epochs 20] [--csv path/to/candles.csv]

Строит последовательности через build_weekly_sequences, обучает WeeklyForecastLSTM,
сохраняет чекпоинт в TRAINING_MODELS_ROOT/weekly/ и логирует в MLflow.
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
from training.data.pipeline import build_weekly_sequences
from training.data.loaders import load_candles_from_csv
from training.experiments import init_mlflow
from training.logs_rollup import append_lightning_rollup, prune_lightning_raw_dirs
from training.models.weekly_lightning import WeeklyForecastLightning, build_weekly_dataloaders

logger = logging.getLogger(__name__)


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
    options_df: pd.DataFrame | None = None,
    llm_aggregates: pd.DataFrame | None = None,
    seq_len: int = 30,
    n_forecast: int = 5,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Строит последовательности из свечей и возвращает train/val тензоры."""
    # Если передан объединенный набор со столбцом FIGI, строим последовательности
    # отдельно по каждому инструменту и конкатенируем выборки. Это исключает
    # "перескок" окон между разными тикерами.
    if "figi" in candles.columns:
        chunks_x: list[np.ndarray] = []
        chunks_y: list[np.ndarray] = []
        for _figi, g in candles.groupby("figi"):
            g_local = g.drop(columns=["figi"], errors="ignore")
            if g_local.empty:
                continue
            X_part, y_part = build_weekly_sequences(
                g_local,
                options=options_df,
                llm_aggregates=llm_aggregates,
                seq_len=seq_len,
                n_forecast=n_forecast,
            )
            if X_part.shape[0] <= 0 or y_part.shape[0] <= 0:
                continue
            chunks_x.append(X_part)
            chunks_y.append(y_part)
        if not chunks_x:
            raise RuntimeError("Pipeline produced empty weekly sequences from multi-instrument candles")
        X_seq = np.concatenate(chunks_x, axis=0)
        y = np.concatenate(chunks_y, axis=0)
    else:
        X_seq, y = build_weekly_sequences(
            candles,
            options=options_df,
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


def _checkpoint_weekly_shape(path: Path) -> tuple[int, int] | None:
    try:
        payload = torch.load(path, map_location="cpu")
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    hp = payload.get("hyper_parameters")
    if not isinstance(hp, dict):
        return None
    try:
        return int(hp.get("input_size")), int(hp.get("seq_len"))
    except (TypeError, ValueError):
        return None


def _checkpoint_weekly_epoch(path: Path) -> int | None:
    try:
        payload = torch.load(path, map_location="cpu")
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    value = payload.get("epoch", payload.get("current_epoch"))
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _select_compatible_weekly_checkpoint(
    ckpt_dir: Path, *, input_size: int, seq_len: int
) -> str | None:
    if not ckpt_dir.exists():
        return None
    latest = sorted(ckpt_dir.glob("*.ckpt"), key=lambda p: p.stat().st_mtime, reverse=True)
    for ckpt in latest:
        shape = _checkpoint_weekly_shape(ckpt)
        if shape == (int(input_size), int(seq_len)):
            return str(ckpt)
    return None


def run(
    max_epochs: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    experiment_name: str | None = None,
    candles_df: pd.DataFrame | None = None,
    seq_len: int = 30,
    n_forecast: int = 5,
    resume_from_latest: bool = False,
    options_df: pd.DataFrame | None = None,
) -> str | None:
    """
    Запускает обучение Weekly forecast. Возвращает run_id MLflow или None.

    Обучение допустимо только по реальным данным (candles_df).
    """
    settings = get_training_settings()
    init_mlflow(experiment_name=experiment_name or settings.mlflow_experiment_name)
    import mlflow

    mlflow.set_experiment(experiment_name or settings.mlflow_experiment_name)

    if candles_df is None or candles_df.empty:
        raise RuntimeError("Synthetic data is disabled: weekly training requires real candles_df")
    X_t, y_t, X_v, y_v = _candles_to_weekly_tensors(
        candles_df,
        options_df=options_df,
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
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = None
    effective_max_epochs = int(max_epochs)
    if resume_from_latest:
        ckpt_path = _select_compatible_weekly_checkpoint(
            ckpt_dir, input_size=input_size, seq_len=seq_len_actual
        )
        if ckpt_path is None:
            logger.info(
                "No compatible weekly checkpoint for input_size=%s seq_len=%s; start fresh",
                input_size,
                seq_len_actual,
            )
        else:
            current_epoch = _checkpoint_weekly_epoch(Path(ckpt_path))
            if current_epoch is not None and effective_max_epochs <= current_epoch:
                effective_max_epochs = current_epoch + 1
                logger.warning(
                    "weekly resume: bump max_epochs from %s to %s (checkpoint epoch=%s)",
                    max_epochs,
                    effective_max_epochs,
                    current_epoch,
                )
    checkpoint_callback = ModelCheckpoint(
        dirpath=str(ckpt_dir),
        filename="weekly_lstm-{epoch:02d}-{val_loss:.4f}",
        save_top_k=1,
        monitor="val_loss",
        mode="min",
    )
    trainer = pl.Trainer(
        max_epochs=effective_max_epochs,
        callbacks=[checkpoint_callback],
        enable_progress_bar=True,
    )
    with mlflow.start_run(run_name="weekly_forecast") as run:
        mlflow.log_params({
            "input_size": input_size,
            "seq_len": seq_len_actual,
            "n_forecast": n_forecast,
            "max_epochs": max_epochs,
            "effective_max_epochs": effective_max_epochs,
            "batch_size": batch_size,
            "lr": lr,
            "data_source": "real_db",
            "resume_from_latest": bool(resume_from_latest),
            "options_features_enabled": bool(options_df is not None and not options_df.empty),
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
                "effective_max_epochs": effective_max_epochs,
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
        help="Путь к CSV со свечами (обязательно).",
    )
    parser.add_argument("--seq-len", type=int, default=30)
    parser.add_argument("--n-forecast", type=int, default=5)
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
        seq_len=args.seq_len,
        n_forecast=args.n_forecast,
    )
    print("MLflow run_id:", run_id)


if __name__ == "__main__":
    main()
